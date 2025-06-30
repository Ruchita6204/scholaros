// Global state management
let currentUser = null;
let authToken = null;
let testResults = [];
let currentQuestion = null;

const API_BASE_URL = 'http://localhost:3000/api';

// Utility function for API calls
async function apiCall(endpoint, method = 'GET', data = null) {
    const options = {
        method,
        headers: {
            'Content-Type': 'application/json',
        }
    };

    if (authToken) {
        options.headers['Authorization'] = `Bearer ${authToken}`;
    }

    if (data) {
        options.body = JSON.stringify(data);
    }

    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, options);
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.error || 'API call failed');
        }
        
        return result;
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
}

// Navigation
function showSection(sectionId) {
    document.querySelectorAll('.section').forEach(section => {
        section.classList.remove('active');
    });
    document.getElementById(sectionId).classList.add('active');
}

// Modal functions
function openModal(modalId) {
    document.getElementById(modalId).style.display = 'block';
}

function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

// Authentication
document.getElementById('loginForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    
    try {
        const response = await apiCall('/login', 'POST', { email, password });
        
        currentUser = response.user;
        authToken = response.token;
        
        // Store token in sessionStorage (not localStorage due to artifact restrictions)
        // In a real app, you'd use localStorage or secure cookies
        
        document.getElementById('userName').textContent = currentUser.name;
        document.querySelector('.auth-buttons').style.display = 'none';
        document.getElementById('userMenu').classList.remove('hidden');
        closeModal('loginModal');
        showSection('userDashboard');
        
        await loadDashboardData();
        alert('Login successful!');
    } catch (error) {
        alert('Login failed: ' + error.message);
    }
});

document.getElementById('registerForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    const name = document.getElementById('registerName').value;
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    
    try {
        await apiCall('/register', 'POST', { name, email, password });
        alert('Registration successful! Please login.');
        closeModal('registerModal');
        openModal('loginModal');
    } catch (error) {
        alert('Registration failed: ' + error.message);
    }
});

function logout() {
    currentUser = null;
    authToken = null;
    document.querySelector('.auth-buttons').style.display = 'flex';
    document.getElementById('userMenu').classList.add('hidden');
    showSection('home');
}

// Load universities from backend
async function loadUniversities() {
    try {
        const universities = await apiCall('/universities');
        displayUniversities(universities);
    } catch (error) {
        console.error('Error loading universities:', error);
    }
}

function displayUniversities(universities) {
    const grid = document.querySelector('.colleges-grid');
    if (!grid) return;
    
    grid.innerHTML = universities.map(uni => `
        <div class="college-card">
            <h3>${uni.name}</h3>
            <p><strong>Country:</strong> ${uni.country}</p>
            <p><strong>Tuition:</strong> ${uni.tuitionFee}</p>
            <p><strong>Scholarships:</strong> ${uni.scholarships.join(', ')}</p>
            <p><strong>Requirements:</strong> ${getRequirements(uni.requirements)}</p>
            ${uni.website ? `<p><a href="${uni.website}" target="_blank" class="btn btn-secondary">Visit Website</a></p>` : ''}
        </div>
    `).join('');
}

function getRequirements(req) {
    const tests = [];
    if (req.gre) tests.push('GRE');
    if (req.gmat) tests.push('GMAT');
    if (req.ielts) tests.push('IELTS');
    if (req.toefl) tests.push('TOEFL');
    return tests.join(', ') || 'Check website';
}

// Load test questions from backend
async function loadTestQuestions(testType, section, limit = 1) {
    try {
        const questions = await apiCall(`/questions/${testType}/${section}?limit=${limit}`);
        return questions;
    } catch (error) {
        console.error('Error loading questions:', error);
        return [];
    }
}

// Quiz functionality
function selectOption(element, isCorrect) {
    document.querySelectorAll('.option').forEach(opt => opt.classList.remove('selected'));
    element.classList.add('selected');
    currentQuestion = { element: element, isCorrect: isCorrect, questionId: element.dataset.questionId };
}

async function submitAnswer() {
    if (!currentQuestion) {
        alert('Please select an answer');
        return;
    }
    
    try {
        const response = await apiCall('/check-answer', 'POST', {
            questionId: currentQuestion.questionId,
            userAnswer: parseInt(currentQuestion.element.dataset.optionIndex)
        });
        
        const resultDiv = document.getElementById('mockTestResults');
        const scoreDetails = document.getElementById('scoreDetails');
        
        if (response.correct) {
            scoreDetails.innerHTML = `<h4>Correct! ✓</h4><p>Explanation: ${response.explanation}</p>`;
        } else {
            scoreDetails.innerHTML = `<h4>Incorrect ✗</h4><p>Explanation: ${response.explanation}</p>`;
        }
        
        resultDiv.classList.remove('hidden');
        
        // Save test result
        if (authToken) {
            const testResult = {
                testType: 'GRE',
                section: 'Verbal',
                score: response.correct ? 100 : 0,
                totalQuestions: 1,
                correctAnswers: response.correct ? 1 : 0,
                timeSpent: 2 // Mock time spent
            };
            
            await saveTestResult(testResult);
        }
    } catch (error) {
        alert('Error checking answer: ' + error.message);
    }
}

async function saveTestResult(testResult) {
    try {
        await apiCall('/test-results', 'POST', testResult);
        await loadDashboardData(); // Refresh dashboard
    } catch (error) {
        console.error('Error saving test result:', error);
    }
}

function saveResults() {
    if (!currentUser) {
        alert('Please login to save results');
        return;
    }
    
    alert('Results saved successfully!');
}

// Dashboard functions
async function loadDashboardData() {
    if (!authToken) return;
    
    try {
        const [stats, results] = await Promise.all([
            apiCall('/dashboard-stats'),
            apiCall('/test-results')
        ]);
        
        updateDashboard(stats, results);
    } catch (error) {
        console.error('Error loading dashboard data:', error);
    }
}

function updateDashboard(stats, results) {
    if (!currentUser) return;
    
    document.getElementById('testsCompleted').textContent = stats.testsCompleted;
    document.getElementById('avgScore').textContent = stats.averageScore;
    document.getElementById('studyTime').textContent = stats.totalStudyTime;
    
    const resultsList = document.getElementById('resultsList');
    if (results && results.length > 0) {
        resultsList.innerHTML = results.map(result => `
            <div style="background: rgba(255,255,255,0.1); padding: 1rem; margin: 0.5rem 0; border-radius: 5px;">
                <strong>${result.testType} ${result.section}</strong> - ${new Date(result.date).toLocaleDateString()}<br>
                Score: ${result.score}% (${result.correctAnswers}/${result.totalQuestions})
                ${result.timeSpent ? `<br>Time: ${result.timeSpent} minutes` : ''}
            </div>
        `).join('');
    } else {
        resultsList.innerHTML = '<p>No test results yet. Take a practice test to get started!</p>';
    }
}

// Initialize sample question with backend data
async function initializeSampleQuestion() {
    try {
        const questions = await loadTestQuestions('GRE', 'Verbal', 1);
        if (questions.length > 0) {
            const question = questions[0];
            const questionContainer = document.querySelector('.question');
            if (questionContainer) {
                questionContainer.innerHTML = `
                    <p>${question.question}</p>
                    <div class="options">
                        ${question.options.map((option, index) => `
                            <div class="option" onclick="selectOption(this, false)" 
                                 data-question-id="${question._id}" 
                                 data-option-index="${index}">
                                ${String.fromCharCode(65 + index)}) ${option}
                            </div>
                        `).join('')}
                    </div>
                `;
            }
        }
    } catch (error) {
        console.error('Error initializing sample question:', error);
    }
}

// Close modals when clicking outside
window.onclick = function(event) {
    if (event.target.classList.contains('modal')) {
        event.target.style.display = 'none';
    }
}

// Smooth scrolling for navigation
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth'
            });
        }
    });
});

// Initialize data on page load
document.addEventListener('DOMContentLoaded', async function() {
    await loadUniversities();
    await initializeSampleQuestion();
    
    // Check if user is logged in (in a real app, you'd check stored token)
    // For demo purposes, we'll just initialize the dashboard
    if (currentUser) {
        await loadDashboardData();
    }
});