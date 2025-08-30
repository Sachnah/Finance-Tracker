const express = require("express");
const router = express.Router();
const Transaction = require("../models/Transaction");
const Budget = require("../models/Budget");
const { protect } = require("../middleware/auth");

// GET /
// Landing Page
router.get("/", (req, res) => {
  if (req.session.userId) {
    return res.redirect("/dashboard");
  }
  res.render("landing", {
    path: "/", // For active sidebar
  });
});

// GET /dashboard
// Dashboard
router.get("/dashboard", protect, async (req, res) => {
  try {
    // Get all transactions for this user
    const transactions = await Transaction.find({ user: req.user._id });

    // Get current month's expenses and budgets
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth(); // 0-indexed for Date object
    const currentYear = currentDate.getFullYear();

    // 1. Filter for current month's expenses
    const monthlyExpenses = transactions.filter((t) => {
      const transactionDate = new Date(t.date);
      return (
        t.type === "expense" &&
        transactionDate.getMonth() === currentMonth &&
        transactionDate.getFullYear() === currentYear
      );
    });

    // 2. Group expenses by category
    const expensesByCategory = {};
    monthlyExpenses.forEach((transaction) => {
      if (!expensesByCategory[transaction.category]) {
        expensesByCategory[transaction.category] = 0;
      }
      expensesByCategory[transaction.category] += transaction.amount;
    });

    // 3. Fetch budgets for the current month
    const budgets = await Budget.find({
      user: req.user._id,
      month: currentMonth + 1, // In schema, month is 1-indexed
      year: currentYear,
    });
    const budgetMap = budgets.reduce((map, b) => {
      map[b.category] = b.amount;
      return map;
    }, {});

    // 4. Combine expenses and budgets into a single object for the view
    const budgetUsage = {};
    const allCategories = new Set([
      ...Object.keys(budgetMap),
      ...Object.keys(expensesByCategory),
    ]);

    allCategories.forEach((category) => {
      const spent = expensesByCategory[category] || 0;
      const budgetAmount = budgetMap[category] || 0;

      if (budgetAmount > 0 || spent > 0) {
        budgetUsage[category] = {
          budget: budgetAmount,
          spent: spent,
          percentage: budgetAmount > 0 ? (spent / budgetAmount) * 100 : 0,
        };
      }
    });

    // 5. Calculate totals for the view
    const totalMonthlyBudget = Object.values(budgetUsage).reduce(
      (sum, b) => sum + b.budget,
      0
    );
    const totalMonthlySpent = Object.values(budgetUsage)
      .filter((b) => b.budget > 0) // Only consider spending in categories with a budget
      .reduce((sum, b) => sum + b.spent, 0);

    // --- Data for Income Source Breakdown Chart ---
    const monthlyIncomes = transactions.filter((t) => {
      const transactionDate = new Date(t.date);
      return (
        t.type === "income" &&
        transactionDate.getMonth() === currentMonth &&
        transactionDate.getFullYear() === currentYear
      );
    });

    const incomeByCategory = {};
    monthlyIncomes.forEach((transaction) => {
      if (!incomeByCategory[transaction.category]) {
        incomeByCategory[transaction.category] = 0;
      }
      incomeByCategory[transaction.category] += transaction.amount;
    });

    // 2-month income vs expense trend data
    const twoMonthsAgo = new Date();
    twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);

    const monthlyData = await Transaction.aggregate([
      {
        $match: {
          user: req.user._id,
          date: { $gte: twoMonthsAgo },
        },
      },
      {
        $group: {
          _id: { year: { $year: "$date" }, month: { $month: "$date" } },
          totalIncome: {
            $sum: { $cond: [{ $eq: ["$type", "income"] }, "$amount", 0] },
          },
          totalExpense: {
            $sum: { $cond: [{ $eq: ["$type", "expense"] }, "$amount", 0] },
          },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
    ]);

    const trendData = {
      labels: [],
      income: [],
      expense: [],
    };

    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];

    // Initialize with last 6 months
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const monthName = monthNames[d.getMonth()];
      const year = d.getFullYear().toString().slice(-2);
      trendData.labels.push(`${monthName} '${year}`);
      trendData.income.push(0);
      trendData.expense.push(0);
    }

    monthlyData.forEach((item) => {
      const monthName = monthNames[item._id.month - 1];
      const year = item._id.year.toString().slice(-2);
      const label = `${monthName} '${year}`;
      const index = trendData.labels.indexOf(label);
      if (index !== -1) {
        trendData.income[index] = item.totalIncome;
        trendData.expense[index] = item.totalExpense;
      }
    });

    // --- Data for Recurring Transactions Chart ---
    const recurringTransactions = transactions.filter((t) => t.isRecurring);
    const recurringByCategory = {};
    recurringTransactions.forEach((transaction) => {
      if (!recurringByCategory[transaction.category]) {
        recurringByCategory[transaction.category] = 0;
      }
      recurringByCategory[transaction.category] += transaction.amount;
    });

    res.render("dashboard", {
      user: req.user,
      transactions: transactions
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 5),
      budgetUsage,
      trendData,
      totalMonthlyBudget,
      totalMonthlySpent,
      incomeByCategory,
      recurringByCategory, // Pass recurring data to the view
      path: "/dashboard", // For active sidebar highlighting
    });
  } catch (err) {
    console.error(err);
    req.flash("error_msg", "Error loading dashboard");
    res.render("dashboard", {
      user: req.user,
      error: "Could not load data",
      path: "/dashboard", // For active sidebar highlighting
    });
  }
});

module.exports = router;
