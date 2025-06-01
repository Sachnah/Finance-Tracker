const BudgetRL = require('../models/BudgetRL');
const Transaction = require('../models/Transaction');
const Budget = require('../models/Budget');

/**
 * Budget Recommendation Service
 * Implements a Budget Pacing Algorithm to provide personalized budget recommendations
 * This replaces the previous Q-learning implementation with a simpler, more intuitive approach
 * Includes real-time recommendation updates when transactions or budgets change
 */
class BudgetRLService {
    
    /**
     * Get or create a model for a user
     * Kept for backward compatibility
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
     * Calculate budget pacing metrics
     * Core of the new algorithm
     */

    static calculateBudgetPace(budget, spent, currentDay, daysInMonth) {
        // Calculate ideal spending by this point in month
        const idealSpentByNow = (budget.amount / daysInMonth) * currentDay;
        
        // Calculate spending pace as a percentage
        const pacePercentage = idealSpentByNow > 0 
            ? (spent / idealSpentByNow) * 100 
            : 0;
        
        // Calculate daily spending rate and projected total
        const dailyRate = currentDay > 0 ? spent / currentDay : 0;
        const projectedSpending = dailyRate * daysInMonth;
        
        // Determine remaining budget
        const remaining = budget.amount - spent;
        
        // Calculate daily budget for rest of month
        const remainingDays = daysInMonth - currentDay;
        const dailyBudget = remainingDays > 0 ? remaining / remainingDays : 0;
        
        return {
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
            pacePercentage, 
            projectedSpending, 
            remaining, 
            dailyBudget, 
            budget,
            dailyRate 
        } = paceData;
        
        let message, type;
        
        // Calculate spent amount from daily rate and current day
        const today = new Date();
        const spent = dailyRate * today.getDate();
        
        // Format currency for better readability
        const formatCurrency = (amount) => {
            return new Intl.NumberFormat('en-IN', {
                style: 'currency',
                currency: 'INR',
                maximumFractionDigits: 0
            }).format(amount);
        };
        
        // Calculate days left in month
        const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
        const daysLeft = daysInMonth - today.getDate();
        
        // Warning - Overspending (>100% of budget used)
        if (pacePercentage > 100) {
          type = 'warning';
          
          if (remaining < 0) {
            // Already overspent
            message = `You've already spent ${formatCurrency(spent)} of your ${category} budget and there are ${daysLeft} days left. You've exceeded your limit — cut back entirely.`;
          } else {
            // Projected to overspend
            const daysUntilExceeded = Math.ceil(remaining / dailyRate);
            message = `You've spent ${formatCurrency(spent)} of your ${category} budget and it's only the ${today.getDate()}th. At this pace, you'll exceed your limit in ${daysUntilExceeded} days.`;
          }
        }
        // Caution - On track but close to limit (90%-100% of budget used)
        else if (pacePercentage >= 90) {
          type = 'caution';
          
          const daysUntilExceeded = Math.ceil(remaining / dailyRate);
          message = `You've spent ${formatCurrency(spent)} of your ${category} budget and it's only the ${today.getDate()}th. At this pace, you'll exceed your limit in ${daysUntilExceeded} days.`;
        }
        // Positive - Well under budget (≤70% of budget used)
        else if (pacePercentage <= 70) {
          type = 'positive';
          
          message = `Only ${formatCurrency(spent)} of your ${category} budget used and ${daysLeft} days left. Strong financial control.`;
        }
        // Info - On track (71%-89% of budget used)
        else {
          type = 'info';
          
          message = `You've used ${formatCurrency(spent)} of your ${category} budget with ${daysLeft} days remaining. You're on track.`;
        }
        
        return { message, type };
    }

    /**
     * Generate an aggregate advisory based on all budget states
     * Provides a holistic view of the user's financial situation
     */
    static generateAggregateAdvisory(recommendations) {
        // If there are no recommendations, provide a simple message to add budgets
        if (!recommendations || recommendations.length === 0) {
            return { 
                message: `📌 Budget Advisory\n"Add budgets for your main expense categories to get personalized financial advice."`, 
                type: "info" 
            };
        }
        
        // Get detailed information for each recommendation
        const detailedRecs = recommendations.map(rec => {
            // Find the matching full recommendation object to get amounts
            const amount = rec.amount || 0;
            const spent = rec.spent || 0;
            const remaining = amount - spent;
            const pacePercentage = rec.pacePercentage || 0;
            const overAmount = pacePercentage > 100 ? (spent - amount) : 0;
            
            return {
                category: rec.category,
                type: rec.type,
                amount: amount,
                spent: spent,
                remaining: remaining,
                pacePercentage: pacePercentage,
                overAmount: overAmount
            };
        });
        
        // Group budgets by their status with detailed info
        const overBudgetDetails = detailedRecs.filter(r => r.type === 'warning');
        const nearLimitDetails = detailedRecs.filter(r => r.type === 'caution');
        const underBudgetDetails = detailedRecs.filter(r => r.type === 'positive');
        const onTrackDetails = detailedRecs.filter(r => r.type === 'info');
        
        // Simple category lists for easy reference
        const overBudget = overBudgetDetails.map(r => r.category);
        const nearLimit = nearLimitDetails.map(r => r.category);
        const underBudget = underBudgetDetails.map(r => r.category);
        const onTrack = onTrackDetails.map(r => r.category);
        
        let message = "";
        let type = "info";
        
        // Determine the most severe status for the advisory type
        if (overBudget.length > 0) {
            type = "warning";
        } else if (nearLimit.length > 0) {
            type = "caution";
        } else if (underBudget.length > 0 && onTrack.length === 0) {
            type = "positive";
        }
        
        // Start with the title
        message = `📌 Budget Advisory\n`;
        
        // Generate a supportive yet detailed advisory message
        let advisoryContent = "";
        
        // Format currency for better readability
        const formatCurrency = (amount) => {
            return '₹' + Math.abs(Math.round(amount)).toLocaleString();
        };
        
        // ALWAYS prioritize overspending and near limit categories first, but with encouraging tone
        if (overBudget.length > 0) {
            // Get total overspent amount
            const totalOverspent = overBudgetDetails.reduce((sum, item) => sum + item.overAmount, 0);
            
            if (overBudget.length === 1) {
                const item = overBudgetDetails[0];
                advisoryContent += `Your ${item.category} budget needs attention - you've spent ${formatCurrency(item.spent)} which is ${formatCurrency(item.overAmount)} over your limit. `;
            } else {
                advisoryContent += `You've exceeded your budget in ${overBudget.join(' and ')} by a total of ${formatCurrency(totalOverspent)}. `;
                
                // Add details for each category
                overBudgetDetails.forEach(item => {
                    advisoryContent += `${item.category}: ${formatCurrency(item.overAmount)} over. `;
                });
            }
            
            if (nearLimit.length > 0) {
                advisoryContent += `Also, watch your ${nearLimit.join(' and ')} spending - `;
                
                nearLimitDetails.forEach(item => {
                    const percentRemaining = Math.round((item.remaining / item.amount) * 100);
                    advisoryContent += `${item.category} has only ${formatCurrency(item.remaining)} (${percentRemaining}%) left. `;
                });
            }
        } else if (nearLimit.length > 0) {
            if (nearLimit.length === 1) {
                const item = nearLimitDetails[0];
                const percentUsed = Math.round((item.spent / item.amount) * 100);
                advisoryContent += `You're doing well overall, but your ${item.category} budget is at ${percentUsed}% (${formatCurrency(item.remaining)} remaining). Try to limit spending here. `;
            } else {
                advisoryContent += `You're approaching your limits on ${nearLimit.join(' and ')}. `;
                
                // Add details for each category
                nearLimitDetails.forEach(item => {
                    const percentRemaining = Math.round((item.remaining / item.amount) * 100);
                    advisoryContent += `${item.category}: ${percentRemaining}% (${formatCurrency(item.remaining)}) remaining. `;
                });
            }
        }
        
        // Add positive reinforcement for under-budget categories
        if (underBudget.length > 0) {
            // Calculate total savings
            const totalSavings = underBudgetDetails.reduce((sum, item) => sum + item.remaining, 0);
            
            if (overBudget.length > 0 || nearLimit.length > 0) {
                // Suggest reallocation with specific amounts
                if (underBudget.length === 1) {
                    const item = underBudgetDetails[0];
                    advisoryContent += `Great job with ${item.category} - you have ${formatCurrency(item.remaining)} available that could help cover your other categories. `;
                } else {
                    advisoryContent += `You're doing great with ${underBudget.join(' and ')} - total savings of ${formatCurrency(totalSavings)}. Consider reallocating some of this to cover your higher-spending areas. `;
                }
            } else {
                // Just praise the savings
                if (underBudget.length === 1) {
                    const item = underBudgetDetails[0];
                    const percentSaved = Math.round((item.remaining / item.amount) * 100);
                    advisoryContent += `Excellent work with ${item.category}! You've spent only ${formatCurrency(item.spent)} (${100-percentSaved}% of budget). `;
                } else {
                    advisoryContent += `You're managing ${underBudget.join(' and ')} really well! Total savings: ${formatCurrency(totalSavings)}. `;
                }
            }
        }
        
        // Mention on-track categories if we haven't mentioned overspending or near-limit
        if (overBudget.length === 0 && nearLimit.length === 0 && onTrack.length > 0) {
            if (advisoryContent) advisoryContent += ' ';
            advisoryContent += `You're right on track with ${onTrack.join(' and ')}. Keep up the good work! `;
        }
        
        // If we have recommendations but couldn't generate any content (edge case)
        if (advisoryContent === "" && recommendations.length > 0) {
            // Check if any recommendation shows overspending based on pace percentage
            const overspendingRecs = recommendations.filter(r => r.pacePercentage && r.pacePercentage > 100);
            
            if (overspendingRecs.length > 0) {
                const categories = overspendingRecs.map(r => r.category).join(' and ');
                advisoryContent = `Your ${categories} spending needs attention - you're on pace to exceed your budget. Try to reduce expenses in these areas.`;
            } else {
                // Check if we're at least at 80% of any budget
                const approachingRecs = recommendations.filter(r => r.pacePercentage && r.pacePercentage > 80);
                
                if (approachingRecs.length > 0) {
                    const categories = approachingRecs.map(r => r.category).join(' and ');
                    advisoryContent = `You're doing well overall! Just keep an eye on ${categories} - you've used over 80% of these budgets.`;
                } else {
                    advisoryContent = `Great job managing your finances! All your budgets are on track, with healthy spending levels across categories.`;
                }
            }
        }
        
        message += `"${advisoryContent}"`;
        
        return { message, type };
    }
    /**
     * Generate personalized recommendations for a user
     * This method maintains the same signature as before for compatibility
     */
    static async generateRecommendations(userId, budgets, transactions) {
        // Keep using the model for storing recommendation history
        const model = await this.getOrCreateModel(userId);
        
        // Clear previous recommendations before generating new ones
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
     * Simplified version that maintains compatibility with existing code
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
        }
        
        await model.save();
        return true;
    }
    
    // These methods are kept for backward compatibility but are no longer used
    
    static getStateRepresentation(budget, spent, daysInMonth, currentDay) {
        // This method is kept for backward compatibility
        // It's no longer used in the new algorithm
        return `${budget.category}_pace`;
    }
    
    static getActions(state) {
        // This method is kept for backward compatibility
        return ['pace_recommendation'];
    }
    
    static chooseAction(state, qValues, explorationRate) {
        // This method is kept for backward compatibility
        return 'pace_recommendation';
    }
    
    static actionToRecommendation(action, state, budget, spent, projectedSpending) {
        // This method is kept for backward compatibility
        // The actual recommendation is now generated by getPaceRecommendation
        return {
            message: `Keep tracking your spending for better financial control.`,
            confidence: 60,
            type: 'general'
        };
    }
    
    static calculateReward(budget, spent, previousSpent) {
        // This method is kept for backward compatibility
        return spent <= budget.amount ? 1 : -1;
    }
    
    static async updateModel(userId, state, action, reward, nextState) {
        // This method is kept for backward compatibility
        // No actual Q-learning updates are performed
        return true;
    }
    
    /**
     * Real-time recommendation update when transactions or budgets change
     * This method should be called whenever a transaction or budget is added, updated, or deleted
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

    /**
     * Real-time recommendation update when transactions or budgets change
     * This method should be called whenever a transaction or budget is added, updated, or deleted
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
