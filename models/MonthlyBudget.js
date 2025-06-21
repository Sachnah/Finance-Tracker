const mongoose = require('mongoose');

const MonthlyBudgetSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  month: {
    type: Number,
    required: true,
    min: 1,
    max: 12
  },
  year: {
    type: Number,
    required: true
  },
  amount: {
    type: Number,
    required: true,
    default: 0
  }
}, { timestamps: true });

// Ensure a user can only have one monthly budget document per month/year
MonthlyBudgetSchema.index({ user: 1, month: 1, year: 1 }, { unique: true });

module.exports = mongoose.model('MonthlyBudget', MonthlyBudgetSchema);
