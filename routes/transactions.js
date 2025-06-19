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

// Protect all routes
router.use(protect);

// GET /transactions
// Get all transactions
router.get('/', async (req, res) => {
  try {
    const { type, search, period = 'thisMonth' } = req.query;
    const userQuery = { user: req.user._id };

    // Date filtering for analytics
    const now = new Date();
    let startDate;
    let endDate;
    const dateFilter = {};

    switch (period) {
      case 'lastMonth':
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        endDate = new Date(now.getFullYear(), now.getMonth(), 0);
        break;
      case 'last7days':
        startDate = new Date();
        startDate.setDate(now.getDate() - 6);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date();
        endDate.setHours(23, 59, 59, 999);
        break;
      case 'thisMonth':
      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0); // Last day of current month
        break;
    }
    dateFilter.date = { $gte: startDate, $lte: endDate };

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
        } else {
          dayMap.get(dateStr).expense += t.amount;
          totalExpense += t.amount;
        }
      }
    });

    const sortedDates = Array.from(dayMap.keys()).sort();
    
    const chartData = {
      labels: sortedDates.map(d => {
        const [year, month, day] = d.split('-').map(Number);
        const date = new Date(Date.UTC(year, month - 1, day));
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
      }),
      income: sortedDates.map(d => dayMap.get(d).income),
      expense: sortedDates.map(d => dayMap.get(d).expense),
    };

    // Filter for transaction list (shows all transactions, not just from the period)
    const listQuery = { ...userQuery };
    if (type && type !== 'all') listQuery.type = type;
    if (search) {
      listQuery.$or = [
        { category: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }

    const transactions = await Transaction.find(listQuery).sort({ date: -1 });

    res.render('transactions', {
      transactions,
      user: req.user,
      path: '/transactions',
      type: type || 'all',
      search: search || '',
      period,
      chartData,
      totalIncome,
      totalExpense,
      netAmount: totalIncome - totalExpense,
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
    let { amount, type, category, description, date } = req.body;
    
    // Validate inputs
    if (!amount || !type) {
      req.flash('error_msg', 'Please provide amount and type');
      return res.redirect('/transactions');
    }

    // If category is not provided by the user, auto-categorize it
    if (!category) {
        category = categorizeTransaction(description);
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
          const percentageSpent = Math.round((totalSpent / budget.amount) * 100);
          req.flash('warning_msg', `Warning: You've spent ${percentageSpent}% of your ${category} budget`);
          
          // Send email alert
          sendBudgetAlertEmail(req.user.email, req.user.name, category, percentageSpent);
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
      user: req.user,
      period: req.query.period || 'thisMonth'
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
    const { period = 'thisMonth' } = req.body;
    res.redirect(`/transactions?period=${period}`);
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
