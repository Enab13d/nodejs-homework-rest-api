const { User } = require("../schemas/user");
const { HTTPError, ctrlWrapper } = require("../helpers");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { SECRET_KEY } = process.env;
const gravatar = require("gravatar");
const path = require("path");
const fs = require("fs/promises");
const { nanoid } = require("nanoid");
const {
  emailService: { sendEmail, createEmail },
} = require("../helpers");

const publicDir = path.join(__dirname, "../", "public", "avatars");

const register = async (req, res, next) => {
  const { email, password } = req.body;
  const isExist = await User.findOne({ email });
  if (isExist) {
    next(HTTPError(409, "Email in use"));
  }
  const hashPassword = await bcrypt.hash(password, 10);
  const avatarURL = gravatar.url(email);
  const verificationToken = nanoid();
  const newUser = await User.create({
    ...req.body,
    password: hashPassword,
    verificationToken,
  });
  const verificationEmail = createEmail(email, verificationToken);
  sendEmail(verificationEmail);
  res.status(201).json({
    user: {
      email: newUser.email,
      subscription: newUser.subscription,
      avatarURL,
    },
  });
};
const login = async (req, res, next) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  if (!user) {
    next(HTTPError(401, "Email or password is wrong"));
  }
  const isPasswordMatch = bcrypt.compare(password, user.password);
  if (!isPasswordMatch) {
    next(HTTPError(401, "Email or password is wrong"));
  }
  if (!user.verify) {
    next(HTTPError(400, "Email is not verified"));
  }
  const payload = {
    id: user._id,
  };
  const token = jwt.sign(payload, SECRET_KEY, { expiresIn: "12h" });
  await User.findByIdAndUpdate(user._id, { token });
  res.status(200).json({
    token,
    user: {
      email,
      subscription: user.subscription,
    },
  });
};
const logout = async (req, res) => {
  const { _id } = req.user;

  await User.findByIdAndUpdate(_id, { token: "" });
  res.status(204).json();
};

const getCurrent = async (req, res) => {
  const { email, subscription } = req.user;
  res.status(200).json({
    email,
    subscription,
  });
};

const updateSubscription = async (req, res, next) => {
  const { _id } = req.user;
  const { subscription } = req.body;
  const updatedUser = await User.findByIdAndUpdate(
    _id,
    { subscription },
    { new: true }
  );
  if (!updatedUser) {
    next(HTTPError(404));
  }
  res.status(200).json({
    message: "Subscription update successful",
    updatedUser,
  });
};

const updateAvatar = async (req, res) => {
  const { path: tempName, originalname } = req.file;
  const { _id } = req.user;
  const fileName = `${_id}_${originalname}`;
  const publicName = path.join(publicDir, fileName);
  await fs.rename(tempName, publicName);
  const avatarURL = path.join("avatars", fileName);
  await User.findByIdAndUpdate(_id, { avatarURL }, { new: true }).select(
    "avatarURL"
  );
  res.status(200).json({
    avatarURL,
  });
};

const verify = async (req, res, next) => {
  const { verificationToken } = req.params;
  const user = await User.findOne({ verificationToken });
  if (!user._id) {
    throw HTTPError(404);
  }
  await User.findByIdAndUpdate(user._id, {
    verify: true,
    verificationToken: null,
  });
  res.status(200).json({ message: "Verification successful" });
};
const resendVerificationEmail = async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email });
  if (user.verify) {
    throw HTTPError(400, "Verification has already been passed");
  }
  const verificationEmail = createEmail(email, user.verificationToken);
  sendEmail(verificationEmail);
  res.status(200).json({ message: "Verification email sent" });
};

module.exports = {
  register: ctrlWrapper(register),
  login: ctrlWrapper(login),
  logout: ctrlWrapper(logout),
  getCurrent: ctrlWrapper(getCurrent),
  updateSubscription: ctrlWrapper(updateSubscription),
  updateAvatar: ctrlWrapper(updateAvatar),
  verify: ctrlWrapper(verify),
  resendVerificationEmail: ctrlWrapper(resendVerificationEmail),
};