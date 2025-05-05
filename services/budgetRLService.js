const BudgetRL = require('../models/BudgetRL');
const Transaction = require('../models/Transaction');
const Budget = require('../models/Budget');

/**
 * Budget Reinforcement Learning Service
 * Implements a Q-learning algorithm to provide personalized budget recommendations
 */
class BudgetRLService {
    
    /**
     * Get or create an RL model for a user
     */
    static async getOrCreateModel(userId) {
        let model = await BudgetRL.findOne({ userId });
        if (!model) {
            model = new BudgetRL({ userId });
            await model.save();
        }
        return model;
    }

    /**
     * Convert user's financial state to a state representation
     */
    static getStateRepresentation(budget, spent, daysInMonth, currentDay) {
        // Calculate spending rate and remaining budget percentage
        const spendingRate = spent / currentDay;
        const projectedSpending = spendingRate * daysInMonth;
        const budgetPercentUsed = budget.amount > 0 ? (spent / budget.amount) * 100 : 0;
        const projectedOverspend = projectedSpending > budget.amount;
        
        // Discretize the state for Q-learning
        const spendingLevel = budgetPercentUsed < 30 ? 'low' : 
                             budgetPercentUsed < 60 ? 'medium' : 
                             budgetPercentUsed < 90 ? 'high' : 'critical';
        
        const timeInMonth = currentDay / daysInMonth < 0.33 ? 'early' :
                           currentDay / daysInMonth < 0.66 ? 'mid' : 'late';
        
        const trajectory = projectedOverspend ? 'overspend' : 'within_budget';
        
        // Create a state key
        return `${budget.category}_${spendingLevel}_${timeInMonth}_${trajectory}`;
    }

    /**
     * Get possible actions for a state
     */
    static getActions(state) {
        const actions = [
            'reduce_spending',
            'maintain_current_pace',
            'can_spend_more',
            'reallocate_from_other_category',
            'save_excess'
        ];
        
        // Filter actions based on state
        const [category, spendingLevel, timeInMonth, trajectory] = state.split('_');
        
        if (trajectory === 'overspend') {
            return actions.filter(a => a !== 'can_spend_more' && a !== 'save_excess');
        }
        
        if (spendingLevel === 'low' || spendingLevel === 'medium') {
            return actions.filter(a => a !== 'reduce_spending');
        }
        
        return actions;
    }

    /**
     * Choose an action using epsilon-greedy policy
     */
    static chooseAction(state, qValues, explorationRate) {
        const actions = this.getActions(state);
        
        // Exploration: randomly select an action
        if (Math.random() < explorationRate) {
            const randomIndex = Math.floor(Math.random() * actions.length);
            return actions[randomIndex];
        }
        
        // Exploitation: choose the best action based on Q-values
        let bestAction = actions[0];
        let bestValue = qValues.get(`${state}_${bestAction}`) || 0;
        
        for (const action of actions) {
            const value = qValues.get(`${state}_${action}`) || 0;
            if (value > bestValue) {
                bestValue = value;
                bestAction = action;
            }
        }
        
        return bestAction;
    }

    /**
     * Convert action to human-readable recommendation
     */
    static actionToRecommendation(action, state, budget, spent, projectedSpending) {
        const [category, spendingLevel, timeInMonth, trajectory] = state.split('_');
        const remaining = budget.amount - spent;
        const overspendAmount = projectedSpending - budget.amount;
        
        switch (action) {
            case 'reduce_spending':
                if (trajectory === 'overspend') {
                    return {
                        message: `To stay within your ${category} budget, try to reduce spending by Rs. ${overspendAmount.toFixed(0)} for the rest of the month.`,
                        confidence: 85,
                        type: 'warning'
                    };
                }
                return {
                    message: `Consider reducing your ${category} spending to ensure you stay within budget.`,
                    confidence: 75,
                    type: 'suggestion'
                };
                
            case 'maintain_current_pace':
                return {
                    message: `You're on track with your ${category} budget. Keep maintaining your current spending pace.`,
                    confidence: 90,
                    type: 'positive'
                };
                
            case 'can_spend_more':
                return {
                    message: `You have Rs. ${remaining.toFixed(0)} remaining in your ${category} budget. You can safely increase spending if needed.`,
                    confidence: 80,
                    type: 'information'
                };
                
            case 'reallocate_from_other_category':
                return {
                    message: `Consider reallocating some funds from your ${category} budget to categories where you might need more.`,
                    confidence: 70,
                    type: 'suggestion'
                };
                
            case 'save_excess':
                return {
                    message: `You're well under budget for ${category}. Consider saving the excess Rs. ${(budget.amount - projectedSpending).toFixed(0)} for future goals.`,
                    confidence: 85,
                    type: 'positive'
                };
                
            default:
                return {
                    message: `Keep tracking your ${category} spending for better financial control.`,
                    confidence: 60,
                    type: 'general'
                };
        }
    }

    /**
     * Update Q-values based on reward
     */
    static async updateModel(userId, state, action, reward, nextState) {
        const model = await this.getOrCreateModel(userId);
        
        const stateActionKey = `${state}_${action}`;
        const currentQ = model.qValues.get(stateActionKey) || 0;
        
        // Get max Q-value for next state
        const nextActions = this.getActions(nextState);
        let maxNextQ = 0;
        
        for (const nextAction of nextActions) {
            const nextQ = model.qValues.get(`${nextState}_${nextAction}`) || 0;
            maxNextQ = Math.max(maxNextQ, nextQ);
        }
        
        // Q-learning update rule
        const newQ = currentQ + model.learningRate * (reward + model.discountFactor * maxNextQ - currentQ);
        
        // Update the Q-value
        model.qValues.set(stateActionKey, newQ);
        model.lastUpdated = new Date();
        
        await model.save();
    }

    /**
     * Calculate reward based on budget adherence
     */
    static calculateReward(budget, spent, previousSpent) {
        const budgetPercent = budget.amount > 0 ? (spent / budget.amount) * 100 : 0;
        const previousPercent = budget.amount > 0 ? (previousSpent / budget.amount) * 100 : 0;
        
        // Reward for staying within budget
        if (budgetPercent <= 100) {
            return 1;
        }
        
        // Reward for improvement
        if (budgetPercent < previousPercent) {
            return 0.5;
        }
        
        // Penalty for overspending
        return -1;
    }

    /**
     * Generate personalized recommendations for a user
     */
    static async generateRecommendations(userId, budgets, transactions) {
        const model = await this.getOrCreateModel(userId);
        const recommendations = [];
        
        const today = new Date();
        const currentMonth = today.getMonth() + 1;
        const currentYear = today.getFullYear();
        const currentDay = today.getDate();
        const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
        
        // Process each budget
        for (const budget of budgets) {
            // Only process current month's budgets
            if (budget.month !== currentMonth || budget.year !== currentYear) {
                continue;
            }
            
            // Calculate spending for this budget
            const spent = transactions
                .filter(t => t.type === 'expense' && 
                           t.category === budget.category && 
                           new Date(t.date).getMonth() + 1 === budget.month && 
                           new Date(t.date).getFullYear() === budget.year)
                .reduce((sum, tx) => sum + tx.amount, 0);
            
            // Skip if no spending yet
            if (spent === 0) {
                recommendations.push({
                    message: `Start tracking your ${budget.category} spending to get personalized recommendations.`,
                    confidence: 60,
                    type: 'general'
                });
                continue;
            }
            
            // Calculate projected spending
            const dailyRate = spent / currentDay;
            const projectedSpending = dailyRate * daysInMonth;
            
            // Get state representation
            const state = this.getStateRepresentation(budget, spent, daysInMonth, currentDay);
            
            // Choose action based on learned policy
            const action = this.chooseAction(state, model.qValues, model.explorationRate);
            
            // Convert action to recommendation
            const recommendation = this.actionToRecommendation(action, state, budget, spent, projectedSpending);
            recommendations.push(recommendation);
            
            // Store recommendation for future learning
            model.recommendationHistory.push({
                recommendation: recommendation.message,
                followed: null, // Will be updated later when we can determine if user followed advice
                date: new Date(),
                budget: {
                    category: budget.category,
                    amount: budget.amount
                },
                spending: spent
            });
        }
        
        // Add some general tips if we don't have enough specific recommendations
        if (recommendations.length < 3) {
            recommendations.push({
                message: "Set specific goals for your savings to stay motivated.",
                confidence: 75,
                type: 'general'
            });
            recommendations.push({
                message: "Consider using the 50/30/20 rule: 50% for needs, 30% for wants, and 20% for savings.",
                confidence: 80,
                type: 'general'
            });
        }
        
        await model.save();
        return recommendations;
    }

    /**
     * Update the model based on whether recommendations were followed
     * This should be called periodically (e.g., daily or weekly)
     */
    static async updateModelBasedOnOutcomes(userId) {
        const model = await this.getOrCreateModel(userId);
        const today = new Date();
        
        // Get recommendations that are at least 7 days old and not yet evaluated
        const pendingRecommendations = model.recommendationHistory
            .filter(r => r.followed === null && 
                      (today - new Date(r.date)) / (1000 * 60 * 60 * 24) >= 7);
        
        if (pendingRecommendations.length === 0) {
            return;
        }
        
        // Get recent transactions
        const recentTransactions = await Transaction.find({ 
            user: userId,
            date: { $gte: new Date(today.getTime() - 14 * 24 * 60 * 60 * 1000) }
        });
        
        // Evaluate each pending recommendation
        for (const recommendation of pendingRecommendations) {
            const { budget, spending, date } = recommendation;
            
            // Get transactions after the recommendation was made
            const afterTransactions = recentTransactions.filter(t => 
                t.category === budget.category && 
                new Date(t.date) > new Date(date)
            );
            
            // Calculate spending after recommendation
            const afterSpending = afterTransactions.reduce((sum, tx) => 
                tx.type === 'expense' ? sum + tx.amount : sum, 0);
            
            // Determine if recommendation was followed based on spending pattern
            const followed = afterSpending < spending;
            
            // Update recommendation status
            const recIndex = model.recommendationHistory.findIndex(
                r => r.date.getTime() === new Date(date).getTime() && 
                     r.budget.category === budget.category
            );
            
            if (recIndex !== -1) {
                model.recommendationHistory[recIndex].followed = followed;
            }
            
            // Calculate reward
            const reward = this.calculateReward(budget, afterSpending, spending);
            
            // Get state representation for before and after
            const beforeState = this.getStateRepresentation(
                budget, 
                spending, 
                new Date(budget.year, budget.month, 0).getDate(),
                new Date(date).getDate()
            );
            
            const afterState = this.getStateRepresentation(
                budget,
                afterSpending,
                new Date(budget.year, budget.month, 0).getDate(),
                today.getDate()
            );
            
            // Extract action from recommendation
            let action = 'maintain_current_pace'; // default
            if (recommendation.recommendation.includes('reduce')) {
                action = 'reduce_spending';
            } else if (recommendation.recommendation.includes('can safely increase')) {
                action = 'can_spend_more';
            } else if (recommendation.recommendation.includes('reallocating')) {
                action = 'reallocate_from_other_category';
            } else if (recommendation.recommendation.includes('saving the excess')) {
                action = 'save_excess';
            }
            
            // Update Q-values
            await this.updateModel(userId, beforeState, action, reward, afterState);
        }
        
        await model.save();
    }
}

module.exports = BudgetRLService;
