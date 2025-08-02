const { Sequelize, DataTypes } = require('sequelize');
const config = require('../config/database');

const env = process.env.NODE_ENV || 'development';
const dbConfig = config[env];

// Initialize Sequelize
const sequelize = new Sequelize(
  dbConfig.database,
  dbConfig.username,
  dbConfig.password,
  {
    host: dbConfig.host,
    port: dbConfig.port,
    dialect: dbConfig.dialect,
    logging: dbConfig.logging,
    pool: dbConfig.pool
  }
);

// Import models
const User = require('./User')(sequelize, DataTypes);
const Assessment = require('./Assessment')(sequelize, DataTypes);
const Purchase = require('./Purchase')(sequelize, DataTypes);

// Define associations
User.hasMany(Assessment, { foreignKey: 'userId', as: 'assessments' });
Assessment.belongsTo(User, { foreignKey: 'userId', as: 'user' });

User.hasMany(Purchase, { foreignKey: 'userId', as: 'purchases' });
Purchase.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// Test connection
const testConnection = async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connection established successfully');
  } catch (error) {
    console.error('❌ Unable to connect to database:', error.message);
  }
};

module.exports = {
  sequelize,
  User,
  Assessment,
  Purchase,
  testConnection
};