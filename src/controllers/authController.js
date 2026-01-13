// Authentication controller implementations and placeholders.

import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';

import User, { roles as availableRoles } from '../models/User.js';

const signAuthToken = (userId, role) => {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured.');
  }

  return jwt.sign(
    {
      // Include role so downstream middleware can authorize actions
      role,
    },
    process.env.JWT_SECRET,
    {
      subject: String(userId),
      expiresIn: '1h',
    }
  );
};

const registerUser = async (req, res, next) => {
  try {
    const { name, email, password, role } = req.body || {};

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email, and password are required.' });
    }

    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters long.' });
    }

    if (role && !availableRoles.includes(role)) {
      return res.status(400).json({ message: `Role must be one of: ${availableRoles.join(', ')}.` });
    }

    const normalizedEmail = String(email).toLowerCase();

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(409).json({ message: 'Email is already registered.' });
    }

    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password,
      role: role || 'SupportAgent',
    });

    return res.status(201).json({
      message: 'User registered successfully.',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

const loginUser = async (req, res, next) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }

    const normalizedEmail = String(email).toLowerCase();

    // Fetch stored user record for credential verification
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    // Compare provided password against hashed password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    // Generate signed JWT containing subject (user id) and role
    const token = signAuthToken(user.id, user.role);

    return res.status(200).json({
      message: 'Login successful.',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    next(error);
  }
};

const logoutUser = async (_req, res) => {
  res.status(501).json({ message: 'Logout endpoint not implemented yet.' });
};

export { registerUser, loginUser, logoutUser };
