const BudgetRL = require('../models/BudgetRL');
const Transaction = require('../models/Transaction');
const Budget = require('../models/Budget');

/**
 * Budget Recommendation Service
 * Implements a Budget Pacing Algorithm to provide personalized budget recommendations
 * Uses a deterministic approach based on spending patterns and budget usage
 * Includes real-time recommendation updates when transactions or budgets change
 */
class BudgetRLService {
    
    /**
     * Get or create a model for a user
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
     * Calculate budget pacing metrics/ core of the algorithm
     */

    static calculateBudgetPace(budget, spent, currentDay, daysInMonth) {
        const budgetAmount = parseFloat(budget.amount) || 0;

        // Ensure currentDay is at least 1 to avoid division by zero.
        const daysPassed = Math.max(1, currentDay);

        // Calculate ideal spending by this point in month
        const idealSpentByNow = (budgetAmount / daysInMonth) * daysPassed;
        
        // Calculate spending pace as a percentage
        const pacePercentage = idealSpentByNow > 0 
            ? (spent / idealSpentByNow) * 100 
            : (spent > 0 ? Infinity : 0);
        
        // Calculate daily spending rate and projected total
        const dailyRate = spent / daysPassed;
        const projectedSpending = dailyRate * daysInMonth;
        
        // Determine remaining budget
        const remaining = budgetAmount - spent;
        
        // Calculate daily budget for rest of month
        const remainingDays = daysInMonth - daysPassed;
        const dailyBudget = remainingDays > 0 ? remaining / remainingDays : 0;
        
        return {
            spent,
            pacePercentage,
            dailyRate,
            projectedSpending,
            remaining,
            dailyBudget,
            idealSpentByNow
        };
    }

    /**
     * Generate recommendation based on budget pace
     */
    
    static getPaceRecommendation(category, paceData) {
        const { 
            spent,
            pacePercentage, 
            projectedSpending, 
            remaining, 
            dailyBudget, 
            budget,
            dailyRate 
        } = paceData;
        
        let message, type;
        
        const budgetAmount = parseFloat(budget.amount) || 0;
        
        // Format currency for better readability
        const formatCurrency = (amount) => {
            const num = parseFloat(amount);
            if (isNaN(num)) {
                return new Intl.NumberFormat('en-NP', { style: 'currency', currency: 'NRs', maximumFractionDigits: 0 }).format(0);
            }
            return new Intl.NumberFormat('en-NP', {
                style: 'currency',
                currency: 'NRs',
                maximumFractionDigits: 0
            }).format(num);
        };
        
        // Calculate days left in month
        const today = new Date();
        const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
        const daysLeft = daysInMonth - today.getDate();
        
        // Warning - Overspending (>100% of budget used)
        if (pacePercentage > 100) {
          type = 'warning';
          
          if (remaining <= 0) {
            // Already overspent
            message = `You've already spent ${formatCurrency(spent)} of your ${category} budget and there are ${daysLeft} days left. You've exceeded your limit. STOP SPENDING.`;
          } else {
            // Projected to overspend
            const overBudgetAmount = projectedSpending - budgetAmount;
            message = `You've spent ${formatCurrency(spent)} of your ${category} budget. At this pace, you are projected to spend ${formatCurrency(overBudgetAmount)} by the end of the month.`;
          }
        }
        // Caution - On track but close to limit (90%-100% of budget used)
        else if (pacePercentage >= 90) {
          type = 'caution';
          
          const daysUntilExceeded = dailyRate > 0 ? Math.ceil(remaining / dailyRate) : Infinity;
          message = `You've spent ${formatCurrency(spent)} of your ${category} budget and it's only the ${today.getDate()}th. At this pace, you'll exceed your limit in ${daysUntilExceeded} days.`;
        }
        // Positive - Well under budget (≤60% of budget used)
        else if (pacePercentage <= 60) {
          type = 'positive';
          
          message = `Only ${formatCurrency(spent)} of your ${category} budget used and ${daysLeft} days left. Strong financial control.`;
        }
        // Info - On track (61%-89% of budget used)
        else {
          type = 'info';
          
          message = `You've used ${formatCurrency(spent)} of your ${category} budget with ${daysLeft} days remaining. You're on track.`;
        }
        
        return { message, type };
    }



















    

    
    /**
     * Generate personalized recommendations for a user
     * This method maintains the same signature as before for compatibility
     * Note: we keep the budget pacing algorithm
     */
    static async generateRecommendations(userId, budgets, transactions) {
        // Keep using the model for storing recommendation history (RL functionality commented out)
        const model = await this.getOrCreateModel(userId);
        
        // Clear previous recommendations before generating new ones
        // This was part of the RL approach but we keep it for history tracking
        model.recommendationHistory = model.recommendationHistory.filter(rec => {
            const recDate = new Date(rec.date);
            const now = new Date();
            // Keep recommendations that are older than 30 days for historical purposes
            return (now - recDate) > (30 * 24 * 60 * 60 * 1000);
        });
        
        const recommendations = [];
        
        const today = new Date();
        const currentMonth = today.getMonth() + 1;
        const currentYear = today.getFullYear();
        const currentDay = today.getDate();
        const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
        
        console.log(`Generating recommendations for ${budgets.length} budgets`);
        
        // Process each budget
        for (const budget of budgets) {
            // Only process current month's budgets
            if (budget.month !== currentMonth || budget.year !== currentYear) {
                console.log(`Skipping budget for ${budget.category} - not current month/year`);
                continue;
            }
            
            console.log(`Processing budget for category: ${budget.category}`);
            
            // Calculate spending for this budget
            const spent = transactions
                .filter(t => t.type === 'expense' && 
                           t.category === budget.category && 
                           new Date(t.date).getMonth() + 1 === budget.month && 
                           new Date(t.date).getFullYear() === budget.year)
                .reduce((sum, tx) => sum + tx.amount, 0);
            
            console.log(`${budget.category} - Budget: ${budget.amount}, Spent: ${spent}`);
            
            // For budgets with no spending, provide a different insight instead of skipping
            if (spent === 0) {
                // Add a recommendation for budgets with no transactions
                const noSpendingMessage = `No spending recorded for ${budget.category} yet. Your full budget of ${new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(budget.amount)} is available.`;
                
                console.log(`${budget.category} - No spending: ${noSpendingMessage}`);
                
                recommendations.push({
                    category: budget.category,
                    message: noSpendingMessage,
                    type: 'info',
                    date: new Date(),
                    pacePercentage: 0
                });
                continue;
            }
            
            // Calculate budget pacing metrics
            const paceData = this.calculateBudgetPace(budget, spent, currentDay, daysInMonth);
            paceData.budget = budget.amount;
            
            // Get recommendation based on pace
            const recommendation = this.getPaceRecommendation(budget.category, paceData);
            
            console.log(`${budget.category} - Generated recommendation: ${recommendation.message} (${recommendation.type})`);
            
            // Add to recommendations list
            recommendations.push({
                category: budget.category,
                message: recommendation.message,
                type: recommendation.type,
                date: new Date(),
                pacePercentage: paceData.pacePercentage
                // RL-specific properties have been removed
            });
        }
        
        // Add overall budget recommendation if we have multiple budgets
        if (budgets.filter(b => b.month === currentMonth && b.year === currentYear).length > 1) {
            const totalBudget = budgets
                .filter(b => b.month === currentMonth && b.year === currentYear)
                .reduce((sum, b) => sum + b.amount, 0);
                
            const totalSpent = transactions
                .filter(t => 
                    t.type === 'expense' && 
                    new Date(t.date).getMonth() + 1 === currentMonth && 
                    new Date(t.date).getFullYear() === currentYear
                )
                .reduce((sum, tx) => sum + tx.amount, 0);
            
            const overallPace = totalBudget > 0 
                ? (totalSpent / ((totalBudget / daysInMonth) * currentDay)) * 100 
                : 0;
            
            let overallMessage, overallType, overallConfidence;
            
            if (overallPace > 110) {
                overallMessage = "Looking at the big picture, you might want to slow down your spending a bit this month.";
                overallType = "warning";
            } else if (overallPace < 90) {
                overallMessage = "Overall, you're doing great with your finances this month! Nice work saving money.";
                overallType = "positive";
            } else {
                overallMessage = "Your overall spending is perfectly on track this month. You're balancing things well!";
                overallType = "positive";
            }
            
            recommendations.push({
                category: "overall",
                message: overallMessage,
                type: overallType
            });
        }
        
        // Add some general tips if we don't have enough specific recommendations
        if (recommendations.length < 3) {
            recommendations.push({
                message: "Having clear savings goals can help keep you motivated with your budget.",
                type: 'general',
                category: 'general'
            });
            recommendations.push({
                message: "Many people find the 50/30/20 approach helpful: 50% for needs, 30% for wants, and 20% for savings.",
                type: 'general',
                category: 'general'
            });
        }
        
        await model.save();
        return recommendations;
    }






















































































    
    /**
     * Update the model based on whether recommendations were followed
     * This method is commented out as it was part of the RL implementation
     * Keeping the method signature for backward compatibility
     */
    static async updateModelBasedOnOutcomes(userId) {
        // This method was used to update the RL model based on whether recommendations were followed
        // Since we're not using RL anymore, we're commenting out the implementation
        // but keeping the method for backward compatibility
        
        /*
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
        }
        
        await model.save();
        */
        return true;
    }
    
    // These methods were part of the RL implementation and are now commented out
    // They are kept as empty methods for backward compatibility
    
    static getStateRepresentation(budget, spent, daysInMonth, currentDay) {
        // This method was part of the RL implementation
        // It's commented out as we're not using RL anymore
        return `${budget.category}_pace`;
    }
    
    static getActions(state) {
        // This method was part of the RL implementation
        // It's commented out as we're not using RL anymore
        return ['pace_recommendation'];
    }
    
    static chooseAction(state, qValues, explorationRate) {
        // This method was part of the RL implementation
        // It's commented out as we're not using RL anymore
        return 'pace_recommendation';
    }
    
    static actionToRecommendation(action, state, budget, spent, projectedSpending) {
        // This method was part of the RL implementation
        // It's commented out as we're not using RL anymore
        return {
            message: `Keep tracking your spending for better financial control.`,
            confidence: 60,
            type: 'general'
        };
    }
    
    static calculateReward(budget, spent, previousSpent) {
        // This method was part of the RL implementation
        // It's commented out as we're not using RL anymore
        return spent <= budget.amount ? 1 : -1;
    }
    
    static async updateModel(userId, state, action, reward, nextState) {
        // This method was part of the RL implementation
        // It's commented out as we're not using RL anymore
        return true;
    }
    
    /**
     * Real-time recommendation update when transactions or budgets change
     * This method should be called whenever a transaction or budget is added, updated, or deleted
     * Note: This uses the budget pacing algorithm, not RL
     */
    static async updateRecommendationsRealTime(userId) {
        try {
            // Get current month's budgets
            const today = new Date();
            const currentMonth = today.getMonth() + 1;
            const currentYear = today.getFullYear();
            
            const budgets = await Budget.find({
                user: userId,
                month: currentMonth,
                year: currentYear
            });
            
            // Get all transactions for this user
            const transactions = await Transaction.find({ user: userId });
            
            // Generate fresh recommendations
            await this.generateRecommendations(userId, budgets, transactions);
            
            return true;
        } catch (error) {
            console.error('Error updating real-time recommendations:', error);
            return false;
        }
    }
}

module.exports = BudgetRLService;
