const express = require('express');
const router = express.Router();
const Transaction = require('../models/Transaction');
const Budget = require('../models/Budget');
const { protect } = require('../middleware/auth');
const { createObjectCsvWriter } = require('csv-writer');
const path = require('path');

// Protect all routes
router.use(protect);

// @route   GET /transactions
// @desc    Get all transactions
router.get('/', async (req, res) => {
  try {
    const transactions = await Transaction.find({ user: req.user._id })
      .sort({ date: -1 });
    
    res.render('transactions', {
      transactions,
      user: req.user,
      path: '/transactions' // For active sidebar highlighting
    });
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Could not fetch transactions');
    res.redirect('/dashboard');
  }
});

// @route   POST /transactions
// @desc    Add new transaction
router.post('/', async (req, res) => {
  try {
    const { amount, type, category, description, date } = req.body;
    
    // Validate inputs
    if (!amount || !type || !category) {
      req.flash('error_msg', 'Please provide amount, type and category');
      return res.redirect('/transactions');
    }

    const newTransaction = new Transaction({
      user: req.user._id,
      amount: parseFloat(amount),
      type,
      category,
      description,
      date: date || Date.now()
    });

    await newTransaction.save();

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
          req.flash('warning_msg', `Warning: You've spent ${Math.round((totalSpent / budget.amount) * 100)}% of your ${category} budget`);
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

// @route   GET /transactions/:id/edit
// @desc    Show edit transaction form
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

    res.render('edit-transaction', {
      transaction,
      user: req.user
    });
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Error fetching transaction');
    res.redirect('/transactions');
  }
});

// @route   PUT /transactions/:id
// @desc    Update transaction
router.put('/:id', async (req, res) => {
  try {
    const { amount, type, category, description, date } = req.body;
    
    const transaction = await Transaction.findOne({
      _id: req.params.id,
      user: req.user._id
    });

    if (!transaction) {
      req.flash('error_msg', 'Transaction not found');
      return res.redirect('/transactions');
    }

    transaction.amount = parseFloat(amount);
    transaction.type = type;
    transaction.category = category;
    transaction.description = description;
    transaction.date = date || transaction.date;

    await transaction.save();
    req.flash('success_msg', 'Transaction updated');
    res.redirect('/transactions');
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Error updating transaction');
    res.redirect('/transactions');
  }
});

// @route   DELETE /transactions/:id
// @desc    Delete transaction
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
    req.flash('success_msg', 'Transaction removed');
    res.redirect('/transactions');
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Error deleting transaction');
    res.redirect('/transactions');
  }
});

// @route   GET /transactions/export
// @desc    Export transactions as CSV
router.get('/export', async (req, res) => {
  try {
    const transactions = await Transaction.find({ user: req.user._id })
      .sort({ date: -1 });
    
    if (transactions.length === 0) {
      req.flash('error_msg', 'No transactions to export');
      return res.redirect('/transactions');
    }

    const csvFilePath = path.join(__dirname, '..', 'public', 'exports', `transactions-${Date.now()}.csv`);
    
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
      amount: tx.amount.toFixed(2),
      description: tx.description || ''
    }));

    await csvWriter.writeRecords(csvData);
    
    res.download(csvFilePath, 'transactions.csv', (err) => {
      if (err) {
        console.error(err);
        req.flash('error_msg', 'Error downloading CSV');
        return res.redirect('/transactions');
      }
      
      // Clean up the file after download
      require('fs').unlinkSync(csvFilePath);
    });
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Error exporting transactions');
    res.redirect('/transactions');
  }
});

module.exports = router;
