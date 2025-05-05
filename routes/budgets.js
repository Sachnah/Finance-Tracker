const express = require('express');
const router = express.Router();
const Budget = require('../models/Budget');
const Transaction = require('../models/Transaction');
const { protect } = require('../middleware/auth');
const BudgetRLService = require('../services/budgetRLService');

// Protect all routes
router.use(protect);

// @route   GET /budgets
// @desc    Get all budgets
router.get('/', async (req, res) => {
  try {
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth() + 1; // JS months are 0-indexed
    const currentYear = currentDate.getFullYear();

    // Get all budgets for this user (not just current month)
    const budgets = await Budget.find({
      user: req.user._id
    }).sort({ year: -1, month: -1 }); // Sort by most recent first
    
    // Get all transactions for this user (for any budget period)
    const transactions = await Transaction.find({
      user: req.user._id
    });
    
    // Generate smart budget recommendations using reinforcement learning
    const smartRecommendations = await BudgetRLService.generateRecommendations(
      req.user._id,
      budgets,
      transactions
    );
    
    // Update the RL model based on past recommendations and outcomes
    // This runs asynchronously and doesn't block the response
    BudgetRLService.updateModelBasedOnOutcomes(req.user._id).catch(err => {
      console.error('Error updating RL model:', err);
    });
    
    res.render('budgets', {
      budgets,
      transactions,
      smartRecommendations,
      user: req.user,
      currentMonth,
      currentYear,
      path: '/budgets' // For active sidebar highlighting
    });
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Could not fetch budgets');
    res.redirect('/dashboard');
  }
});

// @route   POST /budgets
// @desc    Add new budget
router.post('/', async (req, res) => {
  try {
    const { category, amount, month, year } = req.body;
    
    // Validate inputs
    if (!category || !amount) {
      req.flash('error_msg', 'Please provide category and amount');
      return res.redirect('/budgets');
    }

    // Check if budget already exists for this category/month/year
    const existingBudget = await Budget.findOne({
      user: req.user._id,
      category,
      month: parseInt(month),
      year: parseInt(year)
    });

    if (existingBudget) {
      // Update existing budget
      existingBudget.amount = parseFloat(amount);
      await existingBudget.save();
      req.flash('success_msg', 'Budget updated');
    } else {
      // Create new budget
      const newBudget = new Budget({
        user: req.user._id,
        category,
        amount: parseFloat(amount),
        month: parseInt(month),
        year: parseInt(year)
      });
      await newBudget.save();
      req.flash('success_msg', 'Budget added');
    }
    
    res.redirect('/budgets');
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Error adding budget');
    res.redirect('/budgets');
  }
});

// @route   DELETE /budgets/:id
// @desc    Delete budget
router.delete('/:id', async (req, res) => {
  try {
    const budget = await Budget.findOne({
      _id: req.params.id,
      user: req.user._id
    });

    if (!budget) {
      req.flash('error_msg', 'Budget not found');
      return res.redirect('/budgets');
    }

    await Budget.deleteOne({ _id: budget._id });
    req.flash('success_msg', 'Budget removed');
    res.redirect('/budgets');
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Error deleting budget');
    res.redirect('/budgets');
  }
});

module.exports = router;
