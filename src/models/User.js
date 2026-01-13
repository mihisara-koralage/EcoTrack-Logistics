import mongoose from 'mongoose';
import bcrypt from 'bcrypt';

const { Schema } = mongoose;

const roles = ['Supervisor', 'Driver', 'SupportAgent'];

const userSchema = new Schema(
  {
    // Full name of the user for display and identification
    name: {
      type: String,
      required: true,
      trim: true,
    },
    // Unique email address used as primary login credential
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    // Hashed password used for authentication
    password: {
      type: String,
      required: true,
      minlength: 8,
    },
    // Role defining system permissions (Supervisor, Driver, SupportAgent)
    role: {
      type: String,
      enum: roles,
      required: true,
      default: 'SupportAgent',
    },
  },
  {
    timestamps: true,
  }
);

userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) {
    return next();
  }

  try {
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(this.password, saltRounds);
    this.password = hashedPassword;
    next();
  } catch (error) {
    next(error);
  }
});

const User = mongoose.model('User', userSchema);

export { roles };
export default User;
