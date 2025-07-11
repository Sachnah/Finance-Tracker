const express = require('express');
const router = express.Router();
const Transaction = require('../models/Transaction');
const { protect } = require('../middleware/auth');

// Protect all routes
router.use(protect);

// @desc    Contribute to savings
// @route   POST /savings/contribute
router.post('/contribute', async (req, res) => {
  try {
    const { amount, description } = req.body;
    const contributionAmount = parseFloat(amount);

    if (!contributionAmount || contributionAmount <= 0) {
      req.flash('error_msg', 'Please enter a valid amount.');
      return res.redirect('/dashboard');
    }

    // 1. Calculate true available balance
    const transactions = await Transaction.find({ user: req.user.id });
    const totalIncome = transactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);
    const totalExpense = transactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0);
    const availableBalance = totalIncome - totalExpense;

    // 2. Validate contribution
    if (contributionAmount > availableBalance) {
      req.flash('error_msg', `Insufficient funds. Your available balance is Rs ${availableBalance.toFixed(2)}.`);
      return res.redirect('/dashboard');
    }

    // 3. Create two transactions for accounting
    const newExpense = {
      user: req.user.id,
      amount: contributionAmount,
      type: 'expense',
      category: 'Savings',
      description: description || 'Contribution to savings',
      date: new Date()
    };

    const newSaving = {
        user: req.user.id,
        amount: contributionAmount,
        type: 'saving',
        category: 'Contribution',
        description: description || 'Contribution to savings',
        date: new Date()
    };

    await Transaction.create(newExpense);
    await Transaction.create(newSaving);

    req.flash('success_msg', 'Successfully contributed to your savings!');
    res.redirect('/dashboard');

  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Could not contribute to savings.');
    res.redirect('/dashboard');
  }
});

module.exports = router;
