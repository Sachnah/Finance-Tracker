const cron = require('node-cron');
const Transaction = require('../models/Transaction');

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
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Set to the beginning of the day

    try {
        const recurringTransactions = await Transaction.find({
            isRecurring: true,
            nextRecurringDate: { $lte: today }
        });

        for (const trans of recurringTransactions) {
            // Create a new transaction from the recurring one
            const newTransaction = new Transaction({
                user: trans.user,
                amount: trans.amount,
                type: trans.type,
                category: trans.category,
                description: `${trans.description || ''} (Recurring)`,
                date: new Date(), // Set to today's date
                isRecurring: false, // The new transaction is not a template
            });

            await newTransaction.save();
            console.log(`Created new transaction from recurring ID: ${trans._id}`);

            // Update the next recurring date of the original transaction
            trans.nextRecurringDate = calculateNextDate(trans.nextRecurringDate, trans.recurringInterval);
            await trans.save();
            console.log(`Updated next recurring date for ID: ${trans._id} to ${trans.nextRecurringDate}`);
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
