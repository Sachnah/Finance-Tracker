const express = require('express');
const router = express.Router();
const SavingsGoal = require('../models/SavingsGoal');
const { protect } = require('../middleware/auth');

// Protect all routes
router.use(protect);

// @desc    Get all savings goals
// @route   GET /savings-goals
router.get('/', async (req, res) => {
  try {
    const savingsGoals = await SavingsGoal.find({ user: req.user.id }).sort({ deadline: 1 });
    // This route is intended to be used by an API call from the frontend,
    // so we return JSON instead of rendering a view.
    res.status(200).json({
      success: true,
      count: savingsGoals.length,
      data: savingsGoals
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
});

// @desc    Add a savings goal
// @route   POST /savings-goals
router.post('/', async (req, res) => {
  try {
    req.body.user = req.user.id;
    const { name, targetAmount, deadline } = req.body;

    if (!name || !targetAmount) {
        req.flash('error_msg', 'Please provide a name and target amount.');
        return res.redirect('/dashboard');
    }

    await SavingsGoal.create(req.body);
    req.flash('success_msg', 'Savings goal added!');
    res.redirect('/dashboard');

  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Could not add savings goal.');
    res.redirect('/dashboard');
  }
});

// @desc    Update the current amount of a savings goal
// @route   POST /savings-goals/:id/contribute
router.post('/:id/contribute', async (req, res) => {
    try {
        let savingsGoal = await SavingsGoal.findById(req.params.id);

        if (!savingsGoal) {
            req.flash('error_msg', 'Savings goal not found.');
            return res.redirect('/dashboard');
        }

        if (savingsGoal.user.toString() !== req.user.id) {
            req.flash('error_msg', 'Not authorized.');
            return res.redirect('/dashboard');
        }
        
        const { contributionAmount } = req.body;
        const amount = parseFloat(contributionAmount);

        if (!amount || amount <= 0) {
            req.flash('error_msg', 'Please enter a valid contribution amount.');
            return res.redirect('/dashboard');
        }

        savingsGoal.currentAmount += amount;

        await savingsGoal.save();

        req.flash('success_msg', `Successfully contributed to ${savingsGoal.name}!`);
        res.redirect('/dashboard');

    } catch (err) {
        console.error(err);
        req.flash('error_msg', 'Error making contribution.');
        res.redirect('/dashboard');
    }
});


// @desc    Delete a savings goal
// @route   POST /savings-goals/:id/delete
router.post('/:id/delete', async (req, res) => {
  try {
    const savingsGoal = await SavingsGoal.findById(req.params.id);

    if (!savingsGoal) {
      req.flash('error_msg', 'Savings goal not found.');
      return res.redirect('/dashboard');
    }

    if (savingsGoal.user.toString() !== req.user.id) {
      req.flash('error_msg', 'Not authorized.');
      return res.redirect('/dashboard');
    }

    await savingsGoal.remove();

    req.flash('success_msg', 'Savings goal deleted.');
    res.redirect('/dashboard');

  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Could not delete savings goal.');
    res.redirect('/dashboard');
  }
});

module.exports = router;
