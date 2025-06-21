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
    /**
     * Format currency for better readability
     */
    static formatCurrency(amount) {
        const num = parseFloat(amount);
        if (isNaN(num)) {
            return new Intl.NumberFormat('en-NP', { style: 'currency', currency: 'NRs', maximumFractionDigits: 0 }).format(0);
        }
        return new Intl.NumberFormat('en-NP', {
            style: 'currency',
            currency: 'NRs',
            maximumFractionDigits: 0
        }).format(num);
    }

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
          
          if (remaining === 0) {
            // Exactly at budget
            message = `You have spent the entire budget for the ${category} category. Be careful with any further spending.`;
          } else if (remaining < 0) {
            // Already overspent
            message = `You've already spent ${formatCurrency(spent)} of your ${category} budget. You've exceeded your limit. STOP spending.`;
          } else {
            // Projected to overspend
            const overBudgetAmount = projectedSpending - budgetAmount;
            message = `You've spent ${formatCurrency(spent)} of your ${category} budget. At this pace, you are projected to go over budget by ${formatCurrency(overBudgetAmount)}.`;
          }
        }
        // Caution - On track but close to limit (90%-100% of budget used)
        else if (pacePercentage >= 90) {
          type = 'caution';
          
          const daysUntilExceeded = dailyRate > 0 ? Math.ceil(remaining / dailyRate) : Infinity;
          message = `You've spent ${formatCurrency(spent)} of your ${category} budget. At this pace, you'll exceed your limit in ${daysUntilExceeded} days. CONTROL your spending.`;
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
        const formatCurrency = (amount) => {
            const num = parseFloat(amount);
            if (isNaN(num)) {
                return 'Rs 0';
            }
            return 'Rs ' + Math.round(num).toLocaleString('en-IN');
        };

        for (const budget of budgets) {
            const spent = transactions
                .filter(t => t.type === 'expense' && 
                           t.category === budget.category && 
                           new Date(t.date).getMonth() + 1 === budget.month && 
                           new Date(t.date).getFullYear() === budget.year)
                .reduce((sum, tx) => sum + tx.amount, 0);

            // Check if the budget is for the current month
            if (budget.month === currentMonth && budget.year === currentYear) {
                // Current month logic
                console.log(`Processing current month budget for category: ${budget.category}`);
                
                if (spent === 0) {
                    const noSpendingMessage = `No spending recorded for ${budget.category} yet. Your full budget of ${formatCurrency(budget.amount)} is available.`;
                    recommendations.push({
                        category: budget.category,
                        message: noSpendingMessage,
                        type: 'info',
                        icon: 'fas fa-info-circle'
                    });
                    continue;
                }
                
                const paceData = this.calculateBudgetPace(budget, spent, currentDay, daysInMonth);
                paceData.budget = budget.amount; // Pass budget amount to paceData
                const recommendation = this.getPaceRecommendation(budget.category, paceData);
                
                recommendations.push({
                    category: budget.category,
                    message: recommendation.message,
                    type: recommendation.type,
                    icon: recommendation.icon || 'fas fa-chart-line'
                });

            } else {
                // Logic for past or future months
                const budgetDate = new Date(budget.year, budget.month - 1);
                const todayDateStartOfMonth = new Date(currentYear, currentMonth - 1);
                
                let message;
                if (budgetDate < todayDateStartOfMonth) {
                    // Past month
                    message = `For this past month, you spent ${formatCurrency(spent)} of your ${formatCurrency(budget.amount)} budget.`;
                } else {
                    // Future month
                    message = `You have a budget of ${formatCurrency(budget.amount)} set for a future month.`;
                }
                
                recommendations.push({
                    category: budget.category,
                    message: message,
                    type: 'info',
                    icon: 'fas fa-history'
                });
            }
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
     * Save recommendations to the database
     */
    static async saveRecommendations(userId, recommendations) {
        try {
            const model = await this.getOrCreateModel(userId);

            // Replace current recommendations with the new ones
            model.recommendations = recommendations;

            // Add new recommendations to history and prune old entries
            const now = new Date();
            const newHistory = recommendations.map(rec => ({ ...rec, date: now }));

            const thirtyDaysAgo = now.getTime() - (30 * 24 * 60 * 60 * 1000);
            const recentHistory = model.recommendationHistory.filter(rec => new Date(rec.date).getTime() > thirtyDaysAgo);

            model.recommendationHistory = [...recentHistory, ...newHistory];

            await model.save();
            console.log(`Recommendations saved successfully for user ${userId}.`);
            return true;
        } catch (error) {
            console.error(`Error saving recommendations for user ${userId}:`, error);
            return false;
        }
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
            const recommendations = [];
            for (const budget of budgets) {
                const { category, amount: budgetAmount, transactions: budgetTransactions, month: budgetMonth, year: budgetYear } = budget;
                
                if (!budgetAmount || budgetAmount <= 0) {
                    recommendations.push({
                        category,
                        message: 'No budget set for this category.',
                        type: 'info',
                        icon: 'fas fa-info-circle'
                    });
                } else {
                    const spent = budgetTransactions.reduce((sum, t) => sum + t.amount, 0);
                    const remaining = budgetAmount - spent;
                    
                    if (budgetYear !== currentYear || budgetMonth !== currentMonth) {
                        const budgetDate = new Date(budgetYear, budgetMonth - 1, 1);
                        const todayDate = new Date(currentYear, currentMonth - 1, 1);
                        
                        let message;
                        if (budgetDate < todayDate) {
                            message = `For this past month, you spent ${BudgetRLService.formatCurrency(spent)} of your ${BudgetRLService.formatCurrency(budgetAmount)} budget.`;
                        } else {
                            message = `You have a budget of ${BudgetRLService.formatCurrency(budgetAmount)} set for a future month.`;
                        }
                        
                        recommendations.push({
                            category,
                            message,
                            type: 'info',
                            icon: 'fas fa-history'
                        });
                    } else {
                        const percentageSpent = (spent / budgetAmount) * 100;
                        const message = `You have spent ${BudgetRLService.formatCurrency(spent)} of your ${BudgetRLService.formatCurrency(budgetAmount)} budget (${percentageSpent.toFixed(2)}%).`;
                        
                        recommendations.push({
                            category,
                            message,
                            type: 'info',
                            icon: 'fas fa-chart-line'
                        });
                    }
                }
            }
            
            await this.saveRecommendations(userId, recommendations);
            
            return true;
        } catch (error) {
            console.error('Error updating real-time recommendations:', error);
            return false;
        }
    }
}

module.exports = BudgetRLService;
