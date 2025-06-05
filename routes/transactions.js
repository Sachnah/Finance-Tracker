const express = require('express');
const router = express.Router();
const Transaction = require('../models/Transaction');
const Budget = require('../models/Budget');
const { protect } = require('../middleware/auth');
const { createObjectCsvWriter } = require('csv-writer');
const path = require('path');
const BudgetRLService = require('../services/budgetRLService');

// Protect all routes
router.use(protect);

// GET /transactions
// Get all transactions
router.get('/', async (req, res) => {
  try {
    const transactions = await Transaction.find({ user: req.user._id })
      .sort({ date: -1 });
    
    res.render('transactions', {
      transactions,
      BudgetRLService, // Make the service available in the template
      user: req.user,
      path: '/transactions' // For active sidebar highlighting
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

// PUT /transactions/:id
// Update transaction
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
    
    // Update recommendations in real-time after transaction update
    BudgetRLService.updateRecommendationsRealTime(req.user._id).catch(err => {
      console.error('Error updating recommendations:', err);
    });
    
    req.flash('success_msg', 'Transaction updated');
    res.redirect('/transactions');
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Error updating transaction');
    res.redirect('/transactions');
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
