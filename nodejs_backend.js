const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'your-secret-key-change-in-production';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public')); // Serve static files

// MongoDB Connection
mongoose.connect('mongodb://localhost:27017/scholaro', {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log('Connected to MongoDB');
}).catch(err => {
    console.error('MongoDB connection error:', err);
});

// User Schema
const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, default: 'user', enum: ['user', 'admin'] },
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

// Test Result Schema
const testResultSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    testType: { type: String, required: true }, // GRE, GMAT, IELTS, etc.
    section: { type: String, required: true }, // Verbal, Quant, etc.
    score: { type: Number, required: true },
    totalQuestions: { type: Number, required: true },
    correctAnswers: { type: Number, required: true },
    timeSpent: { type: Number, default: 0 }, // in minutes
    date: { type: Date, default: Date.now }
});

const TestResult = mongoose.model('TestResult', testResultSchema);

// University Schema
const universitySchema = new mongoose.Schema({
    name: { type: String, required: true },
    country: { type: String, required: true },
    ranking: { type: Number },
    tuitionFee: { type: String, required: true },
    scholarships: [{ type: String }],
    requirements: {
        gre: { type: Boolean, default: false },
        gmat: { type: Boolean, default: false },
        ielts: { type: Boolean, default: false },
        toefl: { type: Boolean, default: false }
    },
    description: { type: String },
    website: { type: String }
});

const University = mongoose.model('University', universitySchema);

// Question Schema
const questionSchema = new mongoose.Schema({
    testType: { type: String, required: true },
    section: { type: String, required: true },
    question: { type: String, required: true },
    options: [{ type: String }],
    correctAnswer: { type: Number, required: true },
    explanation: { type: String },
    difficulty: { type: String, enum: ['easy', 'medium', 'hard'], default: 'medium' }
});

const Question = mongoose.model('Question', questionSchema);

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid or expired token' });
        }
        req.user = user;
        next();
    });
};

// Auth Routes
app.post('/api/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;

        // Check if user already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ error: 'User already exists' });
        }

        // Hash password
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // Create new user
        const user = new User({
            name,
            email,
            password: hashedPassword
        });

        await user.save();

        res.status(201).json({ message: 'User registered successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Server error during registration' });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Find user
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }

        // Check password
        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }

        // Generate JWT token
        const token = jwt.sign(
            { userId: user._id, email: user.email, role: user.role },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });
    } catch (error) {
        res.status(500).json({ error: 'Server error during login' });
    }
});

// Test Results Routes
app.post('/api/test-results', authenticateToken, async (req, res) => {
    try {
        const { testType, section, score, totalQuestions, correctAnswers, timeSpent } = req.body;

        const testResult = new TestResult({
            userId: req.user.userId,
            testType,
            section,
            score,
            totalQuestions,
            correctAnswers,
            timeSpent
        });

        await testResult.save();
        res.status(201).json({ message: 'Test result saved successfully', result: testResult });
    } catch (error) {
        res.status(500).json({ error: 'Error saving test result' });
    }
});

app.get('/api/test-results', authenticateToken, async (req, res) => {
    try {
        const results = await TestResult.find({ userId: req.user.userId })
            .sort({ date: -1 })
            .limit(10);
        res.json(results);
    } catch (error) {
        res.status(500).json({ error: 'Error fetching test results' });
    }
});

app.get('/api/dashboard-stats', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        
        const totalTests = await TestResult.countDocuments({ userId });
        const results = await TestResult.find({ userId });
        
        const avgScore = results.length > 0 
            ? results.reduce((sum, result) => sum + result.score, 0) / results.length 
            : 0;
            
        const totalStudyTime = results.reduce((sum, result) => sum + (result.timeSpent || 0), 0);

        res.json({
            testsCompleted: totalTests,
            averageScore: Math.round(avgScore),
            totalStudyTime: Math.round(totalStudyTime)
        });
    } catch (error) {
        res.status(500).json({ error: 'Error fetching dashboard stats' });
    }
});

// Universities Routes
app.get('/api/universities', async (req, res) => {
    try {
        const { country, search } = req.query;
        let filter = {};
        
        if (country) filter.country = country;
        if (search) {
            filter.name = { $regex: search, $options: 'i' };
        }

        const universities = await University.find(filter).sort({ ranking: 1 });
        res.json(universities);
    } catch (error) {
        res.status(500).json({ error: 'Error fetching universities' });
    }
});

app.post('/api/universities', authenticateToken, async (req, res) => {
    // Only admin can add universities
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }

    try {
        const university = new University(req.body);
        await university.save();
        res.status(201).json({ message: 'University added successfully', university });
    } catch (error) {
        res.status(500).json({ error: 'Error adding university' });
    }
});

// Questions Routes
app.get('/api/questions/:testType/:section', async (req, res) => {
    try {
        const { testType, section } = req.params;
        const { limit = 10, difficulty } = req.query;

        let filter = { testType, section };
        if (difficulty) filter.difficulty = difficulty;

        const questions = await Question.find(filter)
            .select('-correctAnswer -explanation') // Don't send answers to client
            .limit(parseInt(limit))
            .sort({ _id: -1 });

        res.json(questions);
    } catch (error) {
        res.status(500).json({ error: 'Error fetching questions' });
    }
});

app.post('/api/check-answer', async (req, res) => {
    try {
        const { questionId, userAnswer } = req.body;
        
        const question = await Question.findById(questionId);
        if (!question) {
            return res.status(404).json({ error: 'Question not found' });
        }

        const isCorrect = question.correctAnswer === userAnswer;
        
        res.json({
            correct: isCorrect,
            correctAnswer: question.correctAnswer,
            explanation: question.explanation
        });
    } catch (error) {
        res.status(500).json({ error: 'Error checking answer' });
    }
});

// Add sample data (run once)
app.post('/api/seed-data', async (req, res) => {
    try {
        // Add sample universities
        const universities = [
            {
                name: 'Harvard University',
                country: 'USA',
                ranking: 1,
                tuitionFee: '$54,002/year',
                scholarships: ['Need-based aid up to $75,000', 'Merit scholarships'],
                requirements: { gre: true, toefl: true },
                description: 'Ivy League university in Cambridge, Massachusetts',
                website: 'https://harvard.edu'
            },
            {
                name: 'Stanford University',
                country: 'USA',
                ranking: 2,
                tuitionFee: '$56,169/year',
                scholarships: ['Knight-Hennessy Scholars Program', 'Stanford Graduate Fellowship'],
                requirements: { gre: true, toefl: true },
                description: 'Private research university in California',
                website: 'https://stanford.edu'
            },
            {
                name: 'Oxford University',
                country: 'UK',
                ranking: 3,
                tuitionFee: '£28,370/year',
                scholarships: ['Rhodes Scholarship', 'Clarendon Fund'],
                requirements: { ielts: true, gre: false },
                description: 'Collegiate research university in Oxford, England',
                website: 'https://ox.ac.uk'
            }
        ];

        await University.insertMany(universities);

        // Add sample questions
        const questions = [
            {
                testType: 'GRE',
                section: 'Verbal',
                question: 'The speaker\'s argument was so _______ that even her most ardent supporters began to question her position.',
                options: ['compelling', 'persuasive', 'unconvincing', 'articulate'],
                correctAnswer: 2,
                explanation: 'The context suggests supporters are questioning her position, indicating the argument was unconvincing.',
                difficulty: 'medium'
            },
            {
                testType: 'GRE',
                section: 'Quantitative',
                question: 'If x + y = 10 and x - y = 4, what is the value of x?',
                options: ['3', '5', '7', '9'],
                correctAnswer: 2,
                explanation: 'Solving the system: x + y = 10, x - y = 4. Adding equations: 2x = 14, so x = 7.',
                difficulty: 'easy'
            }
        ];

        await Question.insertMany(questions);

        res.json({ message: 'Sample data seeded successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Error seeding data' });
    }
});

// Serve React app (if you have a build folder)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});

module.exports = app;