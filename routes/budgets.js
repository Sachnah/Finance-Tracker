const express = require('express');
const router = express.Router();
const Budget = require('../models/Budget');
const Transaction = require('../models/Transaction');
const { protect } = require('../middleware/auth');
const BudgetRLService = require('../services/budgetRLService');

// Protect all routes
router.use(protect);

// GET /budgets
// Get all budgets
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
    
    // Generate smart recommendations if there are budgets
    let smartRecommendations = [];
    let aggregateAdvisory = null;
    
    if (budgets.length > 0) {
      // Generate smart budget recommendations using reinforcement learning
      smartRecommendations = await BudgetRLService.generateRecommendations(
        req.user._id,
        budgets,
        transactions
      );
      
      // Debug: Log recommendations to verify they're being generated
      console.log('Generated recommendations:', JSON.stringify(smartRecommendations, null, 2));
      
      // Generate the aggregate advisory
      if (smartRecommendations && smartRecommendations.length > 0) {
        aggregateAdvisory = BudgetRLService.generateAggregateAdvisory(smartRecommendations);
        console.log('Aggregate advisory:', JSON.stringify(aggregateAdvisory, null, 2));
      } else {
        console.log('No recommendations generated or empty recommendations array');
      }
      
      // Update the model based on past recommendations and outcomes
      // This runs asynchronously and doesn't block the response
      BudgetRLService.updateModelBasedOnOutcomes(req.user._id).catch(err => {
        console.error('Error updating recommendation model:', err);
      });
    }

    res.render('budgets', {
      budgets,
      transactions,
      smartRecommendations,
      aggregateAdvisory,
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

// POST /budgets
// Add new budget
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
      
      // Update recommendations in real-time after budget update
      BudgetRLService.updateRecommendationsRealTime(req.user._id).catch(err => {
        console.error('Error updating recommendations:', err);
      });
      
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
      
      // Update recommendations in real-time after new budget
      BudgetRLService.updateRecommendationsRealTime(req.user._id).catch(err => {
        console.error('Error updating recommendations:', err);
      });
      
      req.flash('success_msg', 'Budget added');
    }
    
    res.redirect('/budgets');
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Error adding budget');
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
    res.redirect('/budgets');
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Could not delete budget');
    res.redirect('/budgets');
  }
});

module.exports = router;


