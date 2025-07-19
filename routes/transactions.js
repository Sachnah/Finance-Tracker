const express = require('express');
const router = express.Router();
const Transaction = require('../models/Transaction');
const Budget = require('../models/Budget');
const { protect } = require('../middleware/auth');
const { createObjectCsvWriter } = require('csv-writer');
const path = require('path');
const BudgetRLService = require('../services/budgetRLService');
const { categorizeTransaction } = require('../services/categorizationService');
const { sendBudgetAlertEmail } = require('../services/emailService');
const { processRecurringTransactions, calculateNextDate } = require('../services/recurringTransactionService');

// Protect all routes
router.use(protect);

// GET /transactions
// Get all transactions
router.get('/', async (req, res) => {
  try {
    const { type, search } = req.query;
    const userQuery = { user: req.user._id };

    // Month and Year for chart and list
    const now = new Date();
    const month = parseInt(req.query.month) || now.getMonth() + 1;
    const year = parseInt(req.query.year) || now.getFullYear();

    // Calculate start and end dates for the selected month
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);
    endDate.setHours(23, 59, 59, 999); // End of the last day of the month

    const dateFilter = { date: { $gte: startDate, $lte: endDate } };

    const analyticsTransactions = await Transaction.find({ ...userQuery, ...dateFilter });

    // Process data for chart
    let totalIncome = 0;
    let totalExpense = 0;

    // Create a map of all days in the period to ensure the chart shows empty days
    const dayMap = new Map();
    let iterDate = new Date(startDate);
    iterDate.setHours(0, 0, 0, 0);

    while (iterDate <= endDate) {
        dayMap.set(iterDate.toISOString().split('T')[0], { income: 0, expense: 0 });
        iterDate.setDate(iterDate.getDate() + 1);
    }
    
    analyticsTransactions.forEach(t => {
      const dateStr = new Date(t.date).toISOString().split('T')[0];
      if (dayMap.has(dateStr)) {
        if (t.type === 'income') {
          dayMap.get(dateStr).income += t.amount;
          totalIncome += t.amount;
        } else if (t.type === 'expense') {
          dayMap.get(dateStr).expense += t.amount;
          totalExpense += t.amount;
        }
      }
    });

    const sortedDates = Array.from(dayMap.keys()).sort();
    
    const chartData = {
      labels: sortedDates.map((d) => {
        const [year, month, day] = d.split('-').map(Number);
        const date = new Date(Date.UTC(year, month - 1, day));
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
      }),
      income: sortedDates.map(d => dayMap.get(d).income),
      expense: sortedDates.map(d => dayMap.get(d).expense),
    };

    // Filter for transaction list (shows all transactions, not just from the period)
    const listQuery = { ...userQuery };
    if (type && type !== 'all') {
      if (type === 'recurring') {
        listQuery.isRecurring = true;
      } else {
        listQuery.type = type;
      }
    }
    if (search) {
      listQuery.$or = [
        { category: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }

    const page = parseInt(req.query.page) || 1;
    const limit = 5;
    const skip = (page - 1) * limit;

    const totalTransactions = await Transaction.countDocuments(listQuery);
    const transactions = await Transaction.find(listQuery)
      .sort({ date: -1 })
      .skip(skip)
      .limit(limit);

    const totalPages = Math.ceil(totalTransactions / limit);

    // For month navigation
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    const currentMonthName = new Date(year, month - 1).toLocaleString('default', { month: 'long' });

    let expenseWarning = null;
    if (totalExpense > totalIncome) {
      const formattedExpense = totalExpense.toLocaleString('en-IN', { maximumFractionDigits: 2 });
      const formattedIncome = totalIncome.toLocaleString('en-IN', { maximumFractionDigits: 2 });
      expenseWarning = `Your expenses for ${currentMonthName} (Rs ${formattedExpense}) are higher than your income (Rs ${formattedIncome}). You may have forgotten to log some income.`;
    }

    res.render('transactions', {
      transactions,
      user: req.user,
      path: '/transactions',
      type: type || 'all',
      search: search || '',
      month,
      year,
      currentMonthName,
      prevMonth,
      prevYear,
      nextMonth,
      nextYear,
      chartData,
      totalIncome,
      totalExpense,
      netAmount: totalIncome - totalExpense,
      currentPage: page,
      totalPages,
      expenseWarning, // Pass warning message directly
    });
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Could not fetch transactions');
    res.redirect('/dashboard');
  }
});

// POST /transactions
// Add new transaction
router.post('/', async (req, res) => {
  try {
    let { amount, type, category, description, date, isRecurring, recurringInterval } = req.body;
    
    // Validate inputs
    if (!amount || !type) {
      req.flash('error_msg', 'Please provide amount and type');
      return res.redirect('/transactions/add'); // Redirect back to form
    }

    // Auto-categorize if category is not provided or 'Uncategorized'
    if (!category || category === 'Uncategorized') {
      try {
        category = await categorizeTransaction(description);
      } catch (error) {
        console.error('Categorization failed:', error.message);
        category = 'Uncategorized'; // Fallback category
      }
    }
    
    const transactionData = {
        user: req.user._id,
        amount,
        type,
        category,
        description,
        date: date ? new Date(date) : new Date(),
        isRecurring: isRecurring === 'on', // Checkbox value is 'on'
    };

    if (transactionData.isRecurring) {
        transactionData.recurringInterval = recurringInterval;
        
        const currentDate = new Date(transactionData.date);
        let nextDate = new Date(currentDate);

        switch (recurringInterval) {
            case 'daily':
                nextDate.setDate(currentDate.getDate() + 1);
                break;
            case 'weekly':
                nextDate.setDate(currentDate.getDate() + 7);
                break;
            case 'monthly':
                nextDate.setMonth(currentDate.getMonth() + 1);
                break;
        }
        transactionData.nextRecurringDate = nextDate;
    }

    const newTransaction = new Transaction(transactionData);
    await newTransaction.save();

    // If the new transaction is a recurring template, run the processor immediately to catch up
    if (newTransaction.isRecurring) {
      processRecurringTransactions().catch(err => console.error('Error processing recurring transactions on-demand:', err));
    }
    
    // Update recommendations in real-time
    BudgetRLService.updateRecommendationsRealTime(req.user._id).catch(err => {
      console.error('Error updating recommendations:', err);
    });

    // Check budget alert if this is an expense
    if (type === 'expense') {
      const currentDate = new Date();
      const currentMonth = currentDate.getMonth() + 1; // JS months are 0-indexed
      const currentYear = currentDate.getFullYear();

      const budget = await Budget.findOne({
        user: req.user._id,
        category,
        month: currentMonth,
        year: currentYear
      });

      if (budget) {
        const monthTransactions = await Transaction.find({
          user: req.user._id,
          type: 'expense',
          category,
          date: {
            $gte: new Date(currentYear, currentMonth - 1, 1),
            $lt: new Date(currentYear, currentMonth, 1)
          }
        });
        
        const totalSpent = monthTransactions.reduce((sum, tx) => sum + tx.amount, 0);
        
        if (totalSpent >= budget.amount * 0.9) {
          const percentageSpent = Math.round((totalSpent / budget.amount) * 100);
          req.flash('warning_msg', `Warning: You've spent ${percentageSpent}% of your ${category} budget`);
          
          // Send email alert
          sendBudgetAlertEmail(req.user.email, req.user.name, category, totalSpent, budget.amount);
        }
      }
    }

    req.flash('success_msg', 'Transaction added');
    res.redirect('/transactions');
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Error adding transaction');
    res.redirect('/transactions');
  }
});

// GET /transactions/add
// Show add transaction form
router.get('/add', (req, res) => {
  res.render('add-transaction', {
    user: req.user,
    path: '/transactions/add' // For active sidebar highlighting and script loading
  });
});

// GET /transactions/edit/:id
// Show edit transaction form
router.get('/edit/:id', async (req, res) => {
  try {
    const { month, year } = req.query; // Get month and year from query params
    const transaction = await Transaction.findOne({
      _id: req.params.id,
      user: req.user._id
    });

    if (!transaction) {
      req.flash('error_msg', 'Transaction not found');
      return res.redirect('/transactions');
    }

    // For date input, format as YYYY-MM-DD
    const yyyy = transaction.date.getFullYear();
    const mm = String(transaction.date.getMonth() + 1).padStart(2, '0');
    const dd = String(transaction.date.getDate()).padStart(2, '0');
    const formattedDate = `${yyyy}-${mm}-${dd}`;

    res.render('edit-transaction', {
      transaction,
      formattedDate, // Pass formatted date for the form
      user: req.user,
      path: '/transactions',
      month,
      year
    });
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Error fetching transaction for edit');
    res.redirect('/transactions');
  }
});

// GET /transactions/:id/edit
// Show edit transaction form
router.get('/:id/edit', async (req, res) => {
  try {
    const transaction = await Transaction.findOne({
      _id: req.params.id,
      user: req.user._id
    });

    if (!transaction) {
      req.flash('error_msg', 'Transaction not found');
      return res.redirect('/transactions');
    }

    const now = new Date();
    const month = parseInt(req.query.month) || now.getMonth() + 1;
    const year = parseInt(req.query.year) || now.getFullYear();

    res.render('edit-transaction', {
      transaction,
      user: req.user,
      path: '/transactions',
      month,
      year
    });
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Error fetching transaction');
    res.redirect('/transactions');
  }
});

// PUT /transactions/:id
// Update transaction
router.put('/:id', async (req, res) => {
  try {
    const { type, amount, category, description, date, month, year, isRecurring, recurringInterval } = req.body;

    const transaction = await Transaction.findOne({
      _id: req.params.id,
      user: req.user._id
    });

    if (!transaction) {
      req.flash('error_msg', 'Transaction not found');
      return res.redirect(`/transactions?month=${month}&year=${year}`);
    }

    transaction.type = type;
    transaction.amount = amount;
    transaction.category = category;
    transaction.description = description;
    transaction.date = new Date(date);

    // Handle recurring settings
    transaction.isRecurring = isRecurring === 'on';
    if (transaction.isRecurring) {
      transaction.recurringInterval = recurringInterval;
      // If it's a newly recurring transaction, set the next date
      if (!transaction.nextRecurringDate) {
        transaction.nextRecurringDate = calculateNextDate(transaction.date, recurringInterval);
      }
    } else {
      transaction.recurringInterval = undefined;
      transaction.nextRecurringDate = undefined;
    }

    await transaction.save();

    // If the transaction is now recurring, run the processor to catch up
    if (transaction.isRecurring) {
      processRecurringTransactions().catch(err => console.error('Error processing recurring transactions on-demand:', err));
    }

    await transaction.save();
    
    // Update recommendations in real-time after transaction update
    BudgetRLService.updateRecommendationsRealTime(req.user._id).catch(err => {
      console.error('Error updating recommendations:', err);
    });
    
    req.flash('success_msg', 'Transaction updated');
    res.redirect(`/transactions?month=${month}&year=${year}`);
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Error updating transaction');
    res.redirect('/transactions');
  }
});

// DELETE /transactions/all-by-month
// Delete all transactions for a specific month and year
router.delete('/all-by-month', async (req, res) => {
  try {
    const { month, year } = req.body;
    const userId = req.user._id;

    if (!month || !year) {
      req.flash('error_msg', 'Month and year are required.');
      return res.status(400).redirect('back');
    }

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);
    endDate.setHours(23, 59, 59, 999);

    await Transaction.deleteMany({
      user: userId,
      date: { $gte: startDate, $lte: endDate },
    });

    req.flash('success_msg', `All transactions for ${new Date(year, month - 1).toLocaleString('default', { month: 'long' })} ${year} have been deleted.`);
    res.redirect(`/transactions?month=${month}&year=${year}`);
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Error deleting transactions.');
    res.redirect('back');
  }
});

// DELETE /transactions/:id
// Delete transaction
router.delete('/:id', async (req, res) => {
  try {
    const transaction = await Transaction.findOne({
      _id: req.params.id,
      user: req.user._id
    });

    if (!transaction) {
      req.flash('error_msg', 'Transaction not found');
      return res.redirect('/transactions');
    }

    await Transaction.deleteOne({ _id: transaction._id });
    
    // Update recommendations in real-time after transaction deletion
    BudgetRLService.updateRecommendationsRealTime(req.user._id).catch(err => {
      console.error('Error updating recommendations:', err);
    });
    
    req.flash('success_msg', 'Transaction removed');
    res.redirect('/transactions');
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Error deleting transaction');
    res.redirect('/transactions');
  }
});

// GET /transactions/export
// Export transactions as CSV
router.get('/export', async (req, res) => {
  try {
    const transactions = await Transaction.find({ user: req.user._id })
      .sort({ date: -1 });
    
    if (transactions.length === 0) {
      req.flash('error_msg', 'No transactions to export');
      return res.redirect('/transactions');
    }

    // Make sure the exports directory exists
    const fs = require('fs');
    const exportsDir = path.join(__dirname, '..', 'public', 'exports');
    
    if (!fs.existsSync(exportsDir)) {
      fs.mkdirSync(exportsDir, { recursive: true });
    }

    const csvFilePath = path.join(exportsDir, `transactions-${Date.now()}.csv`);
    
    const csvWriter = createObjectCsvWriter({
      path: csvFilePath,
      header: [
        { id: 'date', title: 'Date' },
        { id: 'type', title: 'Type' },
        { id: 'category', title: 'Category' },
        { id: 'amount', title: 'Amount' },
        { id: 'description', title: 'Description' }
      ]
    });

    const csvData = transactions.map(tx => ({
      date: new Date(tx.date).toLocaleDateString(),
      type: tx.type,
      category: tx.category,
      amount: parseFloat(tx.amount).toFixed(2), // Ensure it's a number with 2 decimal places, no currency symbol
      description: tx.description || ''
    }));

    await csvWriter.writeRecords(csvData);
    
    // Set appropriate headers for Excel compatibility
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="transactions.csv"');
    
    // Send the file
    fs.createReadStream(csvFilePath).pipe(res);
    
    // Clean up the file after a delay to ensure it's fully sent
    setTimeout(() => {
      try {
        if (fs.existsSync(csvFilePath)) {
          fs.unlinkSync(csvFilePath);
        }
      } catch (cleanupErr) {
        console.error('Error cleaning up CSV file:', cleanupErr);
      }
    }, 5000); // 5 second delay
  } catch (err) {
    console.error('Export error:', err);
    req.flash('error_msg', 'Error exporting transactions');
    res.redirect('/transactions');
  }
});

module.exports = router;
