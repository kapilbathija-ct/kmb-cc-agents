import CustomError from '../errors/custom.error.js';

export const errorMiddleware = (error, _req, res, _next) => {
  if (error instanceof CustomError && typeof error.statusCode === 'number') {
    res.status(error.statusCode).json({
      message: error.message,
      errors: error.errors,
    });
    return;
  }

  res.status(500).json({ message: 'Internal server error' });
};
