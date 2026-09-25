const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema({
    // display name, shown in task cards and member lists.
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters'],
      maxlength: [50, 'Name cannot exceed 50 characters'],
    },

    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true, 
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address'],
    },
    
    password_hash: {
      type: String,
      required: [true, 'Password hash is required'],
      select: false, // false keeps it out of default queries
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);


userSchema.pre('save', async function () {
  // Only rehash when the field was actually modified
  if (!this.isModified('password_hash')) return;

  const salt = await bcrypt.genSalt(12);// costy but important to keep you data safe even after being stolen
  this.password_hash = await bcrypt.hash(this.password_hash, salt);
});


userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password_hash);
};

/*
in short: select is not enough to keep the password in backend only so we need to make sure it don't leave the db to front 
*/
userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password_hash;
  delete obj.__v;
  return obj;
};

module.exports = mongoose.model('User', userSchema);
