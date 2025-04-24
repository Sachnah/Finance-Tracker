// Session-based authentication middleware
const User = require('../models/User');

exports.protect = async (req, res, next) => {
  // For simplicity, we're using session-based auth instead of JWT
  if (!req.session.userId) {
    req.flash('error_msg', 'Please log in to access this resource');
    return res.redirect('/users/login');
  }

  try {
    const user = await User.findById(req.session.userId);
    if (!user) {
      req.flash('error_msg', 'User not found');
      return res.redirect('/users/login');
    }
    
    req.user = user;
    next();
  } catch (err) {
    req.flash('error_msg', 'Error authenticating user');
    res.redirect('/users/login');
  }
};
