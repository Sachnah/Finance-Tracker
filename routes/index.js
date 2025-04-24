const express = require('express');
const router = express.Router();
const Transaction = require('../models/Transaction');
const Budget = require('../models/Budget');
const { protect } = require('../middleware/auth');

// @route   GET /
// @desc    Landing Page
router.get('/', (req, res) => {
  if (req.session.userId) {
    return res.redirect('/dashboard');
  }
  res.render('index', {
    path: '/' // For active sidebar highlighting
  });
});

// @route   GET /dashboard
// @desc    Dashboard
router.get('/dashboard', protect, async (req, res) => {
  try {
    // Get all transactions for this user
    const transactions = await Transaction.find({ user: req.user._id });
    
    // Calculate totals
    const totalIncome = transactions
      .filter(t => t.type === 'income')
      .reduce((sum, tx) => sum + tx.amount, 0);
    
    const totalExpense = transactions
      .filter(t => t.type === 'expense')
      .reduce((sum, tx) => sum + tx.amount, 0);
    
    const balance = totalIncome - totalExpense;
    
    // Get current month's budgets
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth() + 1;
    const currentYear = currentDate.getFullYear();
    
    const budgets = await Budget.find({
      user: req.user._id,
      month: currentMonth,
      year: currentYear
    });
    
    // Calculate budget usage
    const budgetUsage = {};
    budgets.forEach(budget => {
      const spent = transactions
        .filter(t => t.type === 'expense' && 
                t.category === budget.category &&
                new Date(t.date).getMonth() + 1 === budget.month &&
                new Date(t.date).getFullYear() === budget.year)
        .reduce((sum, tx) => sum + tx.amount, 0);
      
      budgetUsage[budget.category] = {
        budget: budget.amount,
        spent,
        percentage: budget.amount > 0 ? (spent / budget.amount) * 100 : 0
      };
    });
    
    res.render('dashboard', {
      user: req.user,
      totalIncome,
      totalExpense,
      balance,
      transactions: transactions.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5),
      budgetUsage,
      path: '/dashboard' // For active sidebar highlighting
    });
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Error loading dashboard');
    res.render('dashboard', {
      user: req.user,
      error: 'Could not load data',
      path: '/dashboard' // For active sidebar highlighting
    });
  }
});

module.exports = router;