const express = require('express');
const router = express.Router();
const Budget = require('../models/Budget');
const MonthlyBudget = require('../models/MonthlyBudget');
const Transaction = require('../models/Transaction');
const { protect } = require('../middleware/auth');
const BudgetRLService = require('../services/budgetRLService');
const { sendBudgetAlertEmail } = require('../services/emailService');

// Protect all routes
router.use(protect);

// GET /budgets
// Get all budgets
router.get('/', async (req, res) => {
  try {
    let { month, year } = req.query;
    const currentDate = new Date();

    if (!month || !year) {
      month = currentDate.getMonth() + 1;
      year = currentDate.getFullYear();
    } else {
      month = parseInt(month);
      year = parseInt(year);
    }

    const budgets = await Budget.find({ 
      user: req.user._id, 
      month: month,
      year: year
    });

    const budgetedCategories = budgets.map(b => b.category);

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    let transactions = [];
    if (budgetedCategories.length > 0) {
      // Transactions for budgeted categories only, to calculate spending per budget
      transactions = await Transaction.find({
        user: req.user._id,
        type: 'expense',
        date: { $gte: startDate, $lte: endDate },
        category: { $in: budgetedCategories }
      });
    }

    let monthlyBudget = await MonthlyBudget.findOne({ user: req.user._id, month, year });
    if (!monthlyBudget) {
      monthlyBudget = { amount: 0, month, year }; // Default if not set
    }

    // Calculate total spent from ALL expense transactions for the month
    const allMonthlyExpenses = await Transaction.find({
        user: req.user._id,
        type: 'expense',
        date: { $gte: startDate, $lte: endDate }
    });
    const totalSpent = allMonthlyExpenses.reduce((sum, transaction) => sum + transaction.amount, 0);

    const budgetsForRender = budgets.map(budget => {
      const budgetTransactions = transactions.filter(t => t.category === budget.category);
      const budgetObj = budget.toObject();
      budgetObj.transactions = budgetTransactions;
      return budgetObj;
    });

    let smartRecommendations = [];
    if (budgets.length > 0) {
      const allTransactions = await Transaction.find({ user: req.user._id });
      smartRecommendations = await BudgetRLService.generateRecommendations(
        req.user._id,
        budgets,
        allTransactions
      );
    }

    res.render('budgets', {
      budgets: budgetsForRender,
      totalBudget: monthlyBudget.amount,
      totalSpent,
      smartRecommendations,
      user: req.user,
      currentMonth: month,
      currentYear: year,
      path: '/budgets'
    });
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Could not fetch budgets');
    res.redirect('/dashboard');
  }
});

// POST /budgets
// Add new budget
// POST /budgets/monthly - Set or update the total monthly budget
router.post('/monthly', async (req, res) => {
  const { amount, month, year } = req.body;
  const userId = req.user._id;
  const parsedAmount = parseFloat(amount);
  const parsedMonth = parseInt(month);
  const parsedYear = parseInt(year);

  try {
    if (amount === null || amount === undefined || isNaN(parsedAmount) || parsedAmount < 0) {
      req.flash('error_msg', 'Please provide a valid, non-negative amount.');
      return res.redirect(`/budgets?month=${month}&year=${year}`);
    }

    // Calculate total income for the given month
    const startDate = new Date(parsedYear, parsedMonth - 1, 1);
    const endDate = new Date(parsedYear, parsedMonth, 0, 23, 59, 59);

    const incomeTransactions = await Transaction.find({
      user: userId,
      type: 'income',
      date: { $gte: startDate, $lte: endDate }
    });

    const totalIncome = incomeTransactions.reduce((sum, transaction) => sum + transaction.amount, 0);

    if (parsedAmount > totalIncome) {
      req.flash('error_msg', `Budget (Rs ${parsedAmount.toLocaleString()}) cannot be set because your monthly income of Rs ${totalIncome.toLocaleString()}.`);
      return res.redirect(`/budgets?month=${month}&year=${year}`);
    }

    await MonthlyBudget.findOneAndUpdate(
      { user: userId, month: parsedMonth, year: parsedYear },
      { amount: parsedAmount },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    req.flash('success_msg', 'Total monthly budget has been updated.');
    res.redirect(`/budgets?month=${month}&year=${year}`);
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Error updating monthly budget.');
    res.redirect(`/budgets?month=${month}&year=${year}`);
  }
});

router.post('/', async (req, res) => {
  try {
    const { category, amount, month, year } = req.body;
    
    const parsedAmount = parseFloat(amount);
    if (!category || !parsedAmount || parsedAmount <= 0) {
      req.flash('error_msg', 'Please provide a valid category and a positive amount.');
      return res.redirect(`/budgets?month=${month}&year=${year}`);
    }

    // Check against total monthly budget
    const monthlyBudget = await MonthlyBudget.findOne({ user: req.user._id, month, year });
    if (!monthlyBudget || monthlyBudget.amount === 0) {
      req.flash('error_msg', 'Please set a total monthly budget before adding category budgets.');
      return res.redirect(`/budgets?month=${month}&year=${year}`);
    }

    const categoryBudgets = await Budget.find({ user: req.user._id, month, year });
    const existingBudget = categoryBudgets.find(b => b.category === category);

    const currentCategoryTotal = categoryBudgets
      .filter(b => b.category !== category) // Exclude the budget we are updating
      .reduce((sum, b) => sum + b.amount, 0);

    if (currentCategoryTotal + parsedAmount > monthlyBudget.amount) {
      const remaining = monthlyBudget.amount - currentCategoryTotal;
      req.flash('error_msg', `Budget exceeds monthly limit. You only have ₹${remaining.toFixed(2)} remaining.`);
      return res.redirect(`/budgets?month=${month}&year=${year}`);
    }

    let savedBudget;
    if (existingBudget) {
      existingBudget.amount = parsedAmount;
      savedBudget = await existingBudget.save();
      req.flash('success_msg', 'Budget updated');
    } else {
      savedBudget = await Budget.create({
        user: req.user._id,
        category,
        amount: parsedAmount,
        month: parseInt(month),
        year: parseInt(year)
      });
      req.flash('success_msg', 'Budget added');
    }

    // Check if the new budget is already exceeded
    const startDate = new Date(savedBudget.year, savedBudget.month - 1, 1);
    const endDate = new Date(savedBudget.year, savedBudget.month, 0, 23, 59, 59);

    const monthTransactions = await Transaction.find({
      user: req.user._id,
      type: 'expense',
      category: savedBudget.category,
      date: { $gte: startDate, $lte: endDate }
    });

    const totalSpent = monthTransactions.reduce((sum, t) => sum + t.amount, 0);

    if (savedBudget.amount > 0 && totalSpent >= savedBudget.amount * 0.9) {
      sendBudgetAlertEmail(req.user.email, req.user.name, savedBudget.category, totalSpent, savedBudget.amount);
    }

    BudgetRLService.updateRecommendationsRealTime(req.user._id).catch(err => {
      console.error('Error updating recommendations:', err);
    });
    
    res.redirect(`/budgets?month=${month}&year=${year}`);
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Error adding budget');
    res.redirect('/budgets');
  }
});



// PUT /budgets/:id
// Update budget amount
router.put('/:id', async (req, res) => {
  try {
    const { amount } = req.body;
    const parsedAmount = parseFloat(amount);

    const budgetToUpdate = await Budget.findById(req.params.id);

    if (!budgetToUpdate || budgetToUpdate.user.toString() !== req.user._id.toString()) {
      req.flash('error_msg', 'Budget not found or unauthorized.');
      return res.redirect('/budgets');
    }

    const { month, year, category } = budgetToUpdate;

    if (!amount || isNaN(parsedAmount) || parsedAmount <= 0) {
      req.flash('error_msg', 'Please provide a valid positive amount.');
      return res.redirect(`/budgets?month=${month}&year=${year}`);
    }

    const monthlyBudget = await MonthlyBudget.findOne({ user: req.user._id, month, year });
    if (!monthlyBudget) {
        req.flash('error_msg', 'Total monthly budget not set for this period.');
        return res.redirect(`/budgets?month=${month}&year=${year}`);
    }

    const categoryBudgets = await Budget.find({ user: req.user._id, month, year });
    const otherCategoriesTotal = categoryBudgets
        .filter(b => b.category !== category)
        .reduce((sum, b) => sum + b.amount, 0);

    if (otherCategoriesTotal + parsedAmount > monthlyBudget.amount) {
        const remaining = monthlyBudget.amount - otherCategoriesTotal;
        req.flash('error_msg', `Update failed. Exceeds monthly limit. You can only allocate up to ₹${remaining.toFixed(2)} for this category.`);
        return res.redirect(`/budgets?month=${month}&year=${year}`);
    }

    budgetToUpdate.amount = parsedAmount;
    await budgetToUpdate.save();

    // Check if the updated budget is already exceeded
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    const monthTransactions = await Transaction.find({
      user: req.user._id,
      type: 'expense',
      category: category,
      date: { $gte: startDate, $lte: endDate }
    });

    const totalSpent = monthTransactions.reduce((sum, t) => sum + t.amount, 0);

    if (budgetToUpdate.amount > 0 && totalSpent >= budgetToUpdate.amount * 0.9) {
      sendBudgetAlertEmail(req.user.email, req.user.name, category, totalSpent, budgetToUpdate.amount);
    }

    BudgetRLService.updateRecommendationsRealTime(req.user._id).catch(err => {
      console.error('Error updating recommendations:', err);
    });

    req.flash('success_msg', 'Budget limit updated successfully.');
    res.redirect(`/budgets?month=${month}&year=${year}`);
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Error updating budget.');
    // Attempt to redirect back to the correct page even on error
    if (req.params.id) {
        const budget = await Budget.findById(req.params.id).catch(() => null);
        if (budget) {
            return res.redirect(`/budgets?month=${budget.month}&year=${budget.year}`);
        }
    }
    res.redirect('/budgets');
  }
});

// DELETE /budgets/all-by-month
// Delete all budgets for a specific month
router.delete('/all-by-month', async (req, res) => {
  const { month, year } = req.body;
  try {
    const userId = req.user._id;

    if (!month || !year) {
      req.flash('error_msg', 'Month and year are required to delete budgets.');
      return res.redirect('/budgets');
    }

    await Budget.deleteMany({
      user: userId,
      month: parseInt(month),
      year: parseInt(year)
    });

    req.flash('success_msg', 'All budgets for the selected month have been removed.');
    res.redirect(`/budgets?month=${month}&year=${year}`);
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Could not remove all budgets.');
    if (month && year) {
        return res.redirect(`/budgets?month=${month}&year=${year}`);
    }
    res.redirect('/budgets');
  }
});

// DELETE /budgets/:id
// Delete budget
router.delete('/:id', async (req, res) => {
  try {
    const budget = await Budget.findById(req.params.id);
    
    // Check if budget exists and belongs to user
    if (!budget || budget.user.toString() !== req.user._id.toString()) {
      req.flash('error_msg', 'Budget not found or unauthorized');
      return res.redirect('/budgets');
    }
    
    await Budget.findByIdAndDelete(req.params.id);
    
    // Update recommendations in real-time after budget deletion
    BudgetRLService.updateRecommendationsRealTime(req.user._id).catch(err => {
      console.error('Error updating recommendations:', err);
    });
    
    req.flash('success_msg', 'Budget deleted');
    res.redirect(`/budgets?month=${budget.month}&year=${budget.year}`);
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Could not delete budget');
    res.redirect('/budgets');
  }
});

module.exports = router;


