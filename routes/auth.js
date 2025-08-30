const express = require("express");
const router = express.Router();
const User = require("../models/User");
const { protect } = require("../middleware/auth");
const {
  sendVerificationEmail,
  sendPasswordResetEmail,
} = require("../services/emailService");
const crypto = require("crypto");

// GET /users/register
// Render registration form
router.get("/register", (req, res) => {
  res.render("register", {
    path: "/users/register",
  });
});

// POST /users/register
// Register user
router.post("/register", async (req, res) => {
  const { name, email, password, password2 } = req.body;
  let errors = [];

  // Check required fields
  if (!name || !email || !password || !password2) {
    errors.push({ msg: "Please fill in all fields" });
  }

  // Check passwords match
  if (password !== password2) {
    errors.push({ msg: "Passwords do not match" });
  }

  // Check password length
  if (password.length < 6) {
    errors.push({ msg: "Password should be at least 6 characters" });
  }

  if (errors.length > 0) {
    res.render("register", {
      errors,
      name,
      email,
    });
  } else {
    try {
      // Check if user exists
      const userExists = await User.findOne({ email });

      if (userExists) {
        errors.push({ msg: "Email is already registered" });
        return res.render("register", {
          errors,
          name,
          email,
        });
      }

      // Create new user
      const user = new User({
        name,
        email,
        password,
      });

      // Generate and save verification token
      const verificationToken = user.generateEmailVerificationToken();
      await user.save();

      // Send verification email
      await sendVerificationEmail(user.email, user.name, verificationToken);

      req.flash(
        "success_msg",
        "A verification email has been sent. Please check your inbox to complete your registration."
      );
      res.redirect("/users/login");
    } catch (err) {
      console.error(err);
      req.flash("error_msg", "Server error");
      res.redirect("/users/register");
    }
  }
});

// GET /users/login
// Render login form
router.get("/login", (req, res) => {
  res.render("login", {
    path: "/users/login",
  });
});

// POST /users/login
// Login user
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    // Find user
    const user = await User.findOne({ email });

    if (!user) {
      req.flash("error_msg", "That email is not registered");
      return res.redirect("/users/login");
    }

    // Check if user is verified
    if (!user.isVerified) {
      req.flash(
        "error_msg",
        "Please verify your email to log in. Check your inbox for a verification link."
      );
      return res.redirect("/users/login");
    }

    // Match password
    const isMatch = await user.matchPassword(password);

    if (!isMatch) {
      req.flash("error_msg", "Password incorrect");
      return res.redirect("/users/login");
    }

    // Create session
    req.session.userId = user._id;
    req.flash("success_msg", "You are now logged in");
    res.redirect("/dashboard");
  } catch (err) {
    console.error(err);
    req.flash("error_msg", "Server error");
    res.redirect("/users/login");
  }
});

// GET /users/forgotpassword
// Render forgot password form
router.get("/forgotpassword", (req, res) => {
  res.render("forgotpassword", {
    path: "/users/forgotpassword",
  });
});

// POST /users/forgotpassword
// Process forgot password request
router.post("/forgotpassword", async (req, res) => {
  const { email } = req.body;

  try {
    const user = await User.findOne({ email });

    if (!user) {
      req.flash("error_msg", "No account with that email address exists.");
      return res.redirect("/users/forgotpassword");
    }

    // Generate password reset token
    const resetToken = user.generatePasswordResetToken();
    await user.save();

    // Send password reset email
    await sendPasswordResetEmail(user.email, user.name, resetToken);

    req.flash(
      "success_msg",
      "Password reset email has been sent. Please check your inbox."
    );
    res.redirect("/users/login");
  } catch (err) {
    console.error(err);
    req.flash("error_msg", "Server error");
    res.redirect("/users/forgotpassword");
  }
});

// GET /users/resetpassword/:token
// Render password reset form
router.get("/resetpassword/:token", async (req, res) => {
  try {
    // Get hashed token
    const hashedToken = crypto
      .createHash("sha256")
      .update(req.params.token)
      .digest("hex");

    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() },
    });

    if (!user) {
      req.flash("error_msg", "Password reset token is invalid or has expired.");
      return res.redirect("/users/login");
    }

    res.render("resetpassword", {
      token: req.params.token,
      path: "/users/resetpassword",
    });
  } catch (err) {
    console.error(err);
    req.flash("error_msg", "Server error");
    res.redirect("/users/login");
  }
});

// POST /users/resetpassword/:token
// Process password reset
router.post("/resetpassword/:token", async (req, res) => {
  const { password, password2 } = req.body;
  let errors = [];

  // Check required fields
  if (!password || !password2) {
    errors.push({ msg: "Please fill in all fields" });
  }

  // Check passwords match
  if (password !== password2) {
    errors.push({ msg: "Passwords do not match" });
  }

  // Check password length
  if (password.length < 6) {
    errors.push({ msg: "Password should be at least 6 characters" });
  }

  if (errors.length > 0) {
    return res.render("resetpassword", {
      errors,
      token: req.params.token,
      path: "/users/resetpassword",
    });
  }

  try {
    // Get hashed token
    const hashedToken = crypto
      .createHash("sha256")
      .update(req.params.token)
      .digest("hex");

    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() },
    });

    if (!user) {
      req.flash("error_msg", "Password reset token is invalid or has expired.");
      return res.redirect("/users/login");
    }

    // Set new password
    user.password = password;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    req.flash(
      "success_msg",
      "Password has been reset successfully. You can now log in with your new password."
    );
    res.redirect("/users/login");
  } catch (err) {
    console.error(err);
    req.flash("error_msg", "Server error");
    res.redirect("/users/login");
  }
});

// GET /users/verifyemail/:token
// Verify user's email
router.get("/verifyemail/:token", async (req, res) => {
  try {
    // Get hashed token
    const hashedToken = crypto
      .createHash("sha256")
      .update(req.params.token)
      .digest("hex");

    const user = await User.findOne({
      emailVerificationToken: hashedToken,
      emailVerificationExpires: { $gt: Date.now() },
    });

    if (!user) {
      req.flash("error_msg", "Verification token is invalid or has expired.");
      return res.redirect("/users/register");
    }

    user.isVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    await user.save();

    req.flash(
      "success_msg",
      "Email verified successfully! You can now log in."
    );
    res.redirect("/users/login");
  } catch (err) {
    console.error(err);
    req.flash("error_msg", "Server error during email verification.");
    res.redirect("/users/register");
  }
});

// GET /users/logout
// Logout user
router.get("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.redirect("/dashboard");
    }
    res.redirect("/users/login");
  });
});

// GET /users/profile
// User profile
router.get("/profile", protect, async (req, res) => {
  try {
    // Get user statistics
    const Transaction = require("../models/Transaction");
    const Budget = require("../models/Budget");

    // Get all transactions for this user
    const transactions = await Transaction.find({ user: req.user._id });

    // Calculate statistics
    const totalTransactions = transactions.length;
    const totalIncome = transactions
      .filter((t) => t.type === "income")
      .reduce((sum, t) => sum + t.amount, 0);
    const totalExpense = transactions
      .filter((t) => t.type === "expense")
      .reduce((sum, t) => sum + t.amount, 0);
    const netWorth = totalIncome - totalExpense;

    // Get current month statistics
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth();
    const currentYear = currentDate.getFullYear();

    const currentMonthTransactions = transactions.filter((t) => {
      const transactionDate = new Date(t.date);
      return (
        transactionDate.getMonth() === currentMonth &&
        transactionDate.getFullYear() === currentYear
      );
    });

    const currentMonthIncome = currentMonthTransactions
      .filter((t) => t.type === "income")
      .reduce((sum, t) => sum + t.amount, 0);
    const currentMonthExpense = currentMonthTransactions
      .filter((t) => t.type === "expense")
      .reduce((sum, t) => sum + t.amount, 0);

    // Get budget statistics
    const budgets = await Budget.find({
      user: req.user._id,
      month: currentMonth + 1,
      year: currentYear,
    });

    const totalBudget = budgets.reduce((sum, b) => sum + b.amount, 0);
    const budgetUtilization =
      totalBudget > 0 ? (currentMonthExpense / totalBudget) * 100 : 0;

    // Get account age
    const accountAge = Math.floor(
      (Date.now() - new Date(req.user.date)) / (1000 * 60 * 60 * 24)
    );

    // Get most used categories
    const categoryCounts = {};
    transactions.forEach((t) => {
      categoryCounts[t.category] = (categoryCounts[t.category] || 0) + 1;
    });

    const topCategories = Object.entries(categoryCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([category, count]) => ({ category, count }));

    res.render("profile", {
      user: req.user,
      path: "/users/profile",
      stats: {
        totalTransactions,
        totalIncome,
        totalExpense,
        netWorth,
        currentMonthIncome,
        currentMonthExpense,
        totalBudget,
        budgetUtilization,
        accountAge,
        topCategories,
      },
    });
  } catch (err) {
    console.error(err);
    req.flash("error_msg", "Error loading profile");
    res.redirect("/dashboard");
  }
});

module.exports = router;
