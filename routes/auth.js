const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { protect } = require('../middleware/auth');

// GET /users/register
// Render registration form
router.get('/register', (req, res) => {
  res.render('register', {
    path: '/users/register'
  });
});

// POST /users/register
// Register user
router.post('/register', async (req, res) => {
  const { name, email, password, password2 } = req.body;
  let errors = [];

  // Check required fields
  if (!name || !email || !password || !password2) {
    errors.push({ msg: 'Please fill in all fields' });
  }

  // Check passwords match
  if (password !== password2) {
    errors.push({ msg: 'Passwords do not match' });
  }

  // Check password length
  if (password.length < 6) {
    errors.push({ msg: 'Password should be at least 6 characters' });
  }

  if (errors.length > 0) {
    res.render('register', {
      errors,
      name,
      email
    });
  } else {
    try {
      // Check if user exists
      const userExists = await User.findOne({ email });

      if (userExists) {
        errors.push({ msg: 'Email is already registered' });
        return res.render('register', {
          errors,
          name,
          email
        });
      }

      // Create new user
      const user = new User({
        name,
        email,
        password
      });

      await user.save();
      req.flash('success_msg', 'You are now registered and can log in');
      res.redirect('/users/login');
    } catch (err) {
      console.error(err);
      req.flash('error_msg', 'Server error');
      res.redirect('/users/register');
    }
  }
});

// GET /users/login
// Render login form
router.get('/login', (req, res) => {
  res.render('login', {
    path: '/users/login'
  });
});

// POST /users/login
// Login user
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    // Find user
    const user = await User.findOne({ email });

    if (!user) {
      req.flash('error_msg', 'That email is not registered');
      return res.redirect('/users/login');
    }

    // Match password
    const isMatch = await user.matchPassword(password);

    if (!isMatch) {
      req.flash('error_msg', 'Password incorrect');
      return res.redirect('/users/login');
    }

    // Create session
    req.session.userId = user._id;
    req.flash('success_msg', 'You are now logged in');
    res.redirect('/dashboard');
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Server error');
    res.redirect('/users/login');
  }
});

// GET /users/logout
// Logout user
router.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.redirect('/dashboard');
    }
    res.redirect('/users/login');
  });
});

// GET /users/profile
// User profile
router.get('/profile', protect, (req, res) => {
  res.render('profile', {
    user: req.user,
    path: '/users/profile'
  });
});

module.exports = router;
