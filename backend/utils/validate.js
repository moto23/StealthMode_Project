const mongoose = require('mongoose');
const ApiError = require('./ApiError');

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

// Throw a 400 before any DB query if the id is not a valid ObjectId.
const assertValidObjectId = (id, label = 'id') => {
  if (!isValidObjectId(id)) {
    throw ApiError.badRequest(`Invalid ${label}`);
  }
};

module.exports = { isValidObjectId, assertValidObjectId };
