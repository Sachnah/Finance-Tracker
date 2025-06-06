const mongoose = require('mongoose');

// Schema to store the RL model's state and learning data
const BudgetRLSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    // Q-values for different state-action pairs
    qValues: {
        type: Map,
        of: Number,
        default: new Map()
    },
    // Track which recommendations were followed
    recommendationHistory: [{
        recommendation: String,
        followed: Boolean,
        date: {
            type: Date,
            default: Date.now
        },
        budget: {
            category: String,
            amount: Number
        },
        spending: Number
    }],
    // Model parameters
    learningRate: {
        type: Number,
        default: 0.1
    },
    discountFactor: {
        type: Number,
        default: 0.9
    },
    explorationRate: {
        type: Number,
        default: 0.2
    },
    // Track the last time the model was updated
    lastUpdated: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('BudgetRL', BudgetRLSchema);
