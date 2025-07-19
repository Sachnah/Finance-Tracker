const cron = require('node-cron');
const Transaction = require('../models/Transaction');
const Budget = require('../models/Budget');
const User = require('../models/User');
const { sendBudgetAlertEmail } = require('./emailService');

// Function to calculate the next date based on the interval
const calculateNextDate = (currentDate, interval) => {
    let nextDate = new Date(currentDate);
    switch (interval) {
        case 'daily':
            nextDate.setDate(nextDate.getDate() + 1);
            break;
        case 'weekly':
            nextDate.setDate(nextDate.getDate() + 7);
            break;
        case 'monthly':
            nextDate.setMonth(nextDate.getMonth() + 1);
            break;
    }
    return nextDate;
};

// The core function to process recurring transactions
const processRecurringTransactions = async () => {
    console.log('Running recurring transactions check...');
    const now = new Date();

    try {
        // Find all recurring transactions that are due to be processed
        const dueTransactions = await Transaction.find({
            isRecurring: true,
            nextRecurringDate: { $lte: now }
        });

        for (const trans of dueTransactions) {
            // Loop to catch up on any missed occurrences
            while (trans.nextRecurringDate <= now) {
                // Create a new transaction for the due date
                const newTransaction = new Transaction({
                    user: trans.user,
                    amount: trans.amount,
                    type: trans.type,
                    category: trans.category,
                    description: trans.description || '',
                    date: trans.nextRecurringDate, // Use the scheduled date
                    isRecurring: false,
                });

                await newTransaction.save();
                console.log(`Created recurring transaction for ${trans.nextRecurringDate.toISOString()} from template ${trans._id}`);

                // Check for budget alerts
                if (newTransaction.type === 'expense') {
                    const budget = await Budget.findOne({
                        user: newTransaction.user,
                        category: newTransaction.category
                    });

                    if (budget) {
                        const transactionDate = newTransaction.date;
                        const year = transactionDate.getFullYear();
                        const month = transactionDate.getMonth();
                        const startDate = new Date(year, month, 1);
                        const endDate = new Date(year, month + 1, 0, 23, 59, 59);

                        const monthTransactions = await Transaction.find({
                            user: newTransaction.user,
                            type: 'expense',
                            category: newTransaction.category,
                            date: { $gte: startDate, $lte: endDate }
                        });

                        const totalSpent = monthTransactions.reduce((sum, t) => sum + t.amount, 0);

                        // Check if spending is >= 90% of budget and if an alert hasn't been sent this month
                        const today = new Date();
                        if (totalSpent >= budget.amount * 0.9 && (!budget.lastAlertSent || budget.lastAlertSent.getMonth() < today.getMonth() || budget.lastAlertSent.getFullYear() < today.getFullYear())) {
                            const user = await User.findById(newTransaction.user);
                            if (user) {
                                await sendBudgetAlertEmail(user.email, user.name, budget.category, totalSpent, budget.amount);
                                budget.lastAlertSent = today; // Mark that an alert has been sent
                                await budget.save();
                            }
                        }
                    }
                }

                // Calculate the next date and update the template
                trans.nextRecurringDate = calculateNextDate(trans.nextRecurringDate, trans.recurringInterval);
            }
            
            // Save the final updated date for the template transaction
            await trans.save();
            console.log(`Updated next recurring date for ID: ${trans._id} to ${trans.nextRecurringDate.toISOString()}`);
        }
    } catch (error) {
        console.error('Error processing recurring transactions:', error);
    }
};

// Schedule the job to run once every day at midnight
const start = () => {
    cron.schedule('0 0 * * *', processRecurringTransactions, {
        scheduled: true,
        timezone: "Asia/Kathmandu"
    });
    console.log('Recurring transaction scheduler started.');
};

module.exports = { start, processRecurringTransactions };
