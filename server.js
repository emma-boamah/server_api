import dotenv from 'dotenv';
import express from 'express';
import { WebSocketServer } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import cors from 'cors';
import { URL } from 'url';


dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// ======================
// Security Middleware
// ======================
app.use(helmet());
app.use(cors());
app.use(express.json());

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests, please try again later'
});
app.use('/api/', apiLimiter);

// ======================
// Advanced Features
// ======================
const testSessions = new Map();
const activeConnections = new Map();

// Generate test session with analytics
app.post('/api/initiate-test', express.json(), (req, res) => {
    const { phoneNumber, requestedFeatures } = req.body;
    
    // Input validation
    if (!phoneNumber || !/^\+?\d{10,15}$/.test(phoneNumber)) {
        return res.status(400).json({ 
            error: 'Valid phone number required',
            example: '+1234567890' 
        });
    }

    // Check that phone numbers must be a string
    if (typeof phoneNumber !== 'string') {
        return res.status(400).json({error: 'Phone number must be a string'});
    }

    // Create enhanced test session
    const testId = uuidv4();
    const accessCode = crypto.randomBytes(3).toString('hex').toUpperCase();
    
    testSessions.set(testId, {
        phoneNumber,
        accessCode,
        createdAt: new Date(),
        active: true,
        requestedFeatures: requestedFeatures || ['all'],
        analytics: {
            restCalls: 0,
            wsConnections: 0,
            messagesSent: 0
        },
        testResults: []
    });

    // Generate test links with feature flags
    const baseUrl = process.env.API_URL || `http://localhost:${PORT}`;
    const features = {
        realTime: `${baseUrl}/api/test/real-time?testId=${testId}&code=${accessCode}`,
        wsDemo: `ws://${baseUrl.replace(/^https?:\/\//, '')}?testId=${testId}&code=${accessCode}`,
        loadTest: `${baseUrl}/api/test/load?testId=${testId}&code=${accessCode}`,
        dbDemo: `${baseUrl}/api/test/mock-db?testId=${testId}&code=${accessCode}`,
        instructions: `${baseUrl}/api/test/instructions/${testId}`
    };

    res.json({
        message: `Test session created for ${phoneNumber}`,
        features: {
            description: "This API showcases:",
            items: [
                "JWT-like security without tokens",
                "Real-time WebSocket communication",
                "Request rate limiting",
                "Analytics tracking",
                "Mock database operations",
                "Load testing endpoint",
                "Comprehensive error handling"
            ]
        },
        testLinks: features,
        management: {
            viewResults: `${baseUrl}/api/test/results/${testId}?code=${accessCode}`,
            deactivate: `${baseUrl}/api/test/end-session/${testId}?code=${accessCode}`
        }
    });
});

// ======================
// Feature Endpoints
// ======================

// 1. Real-Time Analytics Endpoint
app.get('/api/test/real-time', (req, res) => {
    const session = verifyTestSession(req.query.testId, req.query.code);
    if (!session) return res.status(401).json({ 
        error: 'Invalid credentials',
        solution: 'Use the exact link provided' 
    });

    session.analytics.restCalls++;
    session.testResults.push({
        endpoint: '/real-time',
        timestamp: new Date(),
        headers: req.headers
    });

    res.json({
        status: 'success',
        features: [
            "Dynamic response generation",
            "Request analytics tracking",
            "CORS enabled",
            "Security headers"
        ],
        analytics: session.analytics,
        system: {
            memory: process.memoryUsage(),
            uptime: process.uptime()
        },
        nextSteps: [
            "Try the WebSocket endpoint for real-time updates",
            "Test the /load endpoint to see rate limiting in action"
        ]
    });
});

// 2. Load Testing Endpoint
app.get('/api/test/load', (req, res) => {
    const session = verifyTestSession(req.query.testId, req.query.code);
    if (!session) return res.status(401).json({ error: 'Invalid credentials' });

    // Simulate CPU-intensive operation
    const start = Date.now();
    const hash = crypto.createHash('sha256').update(crypto.randomBytes(1024)).digest('hex');
    const duration = Date.now() - start;

    session.analytics.restCalls++;
    session.testResults.push({
        endpoint: '/load',
        timestamp: new Date(),
        duration: `${duration}ms`
    });

    res.json({
        operation: 'SHA-256 hash generation',
        duration: `${duration}ms`,
        performance: duration < 10 ? 'excellent' : duration < 50 ? 'good' : 'acceptable',
        message: 'This endpoint demonstrates CPU-bound operation handling'
    });
});

// 3. Mock Database Demo
app.get('/api/test/mock-db', (req, res) => {
    const session = verifyTestSession(req.query.testId, req.query.code);
    if (!session) return res.status(401).json({ error: 'Invalid credentials' });

    // Simulate database operations
    const mockUsers = Array.from({ length: 5 }, (_, i) => ({
        id: i + 1,
        name: `User ${crypto.randomBytes(2).toString('hex')}`,
        lastActive: new Date(Date.now() - Math.random() * 10000000)
    }));

    session.analytics.restCalls++;
    session.testResults.push({
        endpoint: '/mock-db',
        timestamp: new Date(),
        operation: 'mock query'
    });

    res.json({
        description: "Mock database response demonstrating:",
        features: [
            "Data pagination",
            "Dynamic field selection",
            "Simulated latency",
            "Consistent response structure"
        ],
        users: mockUsers,
        metadata: {
            page: 1,
            pageSize: 5,
            total: 100,
            hasMore: true
        },
        queryTime: `${Math.random().toFixed(2)}ms`
    });
});

// ======================
// WebSocket Server with Advanced Features
// ======================
const server = app.listen(PORT, () => {
    console.log(`Advanced API running on port ${PORT}`);
});

server.on('error', (error) => {
    console.error('Error starting server', error);
    process.exit(1);
});

const wss = new WebSocketServer({ server, clientTracking: true });

wss.on('error', (error) => {
    console.error('Error starting WebSocket server', error);
});

wss.on('connection', (ws, req) => {
    try {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const testId = url.searchParams.get('testId');
        const code = url.searchParams.get('code');
        
        const session = verifyTestSession(testId, code);
        if (!session) {
            ws.close(1008, 'Invalid test credentials');
            return;
        }

        // Track connection
        session.analytics.wsConnections++;
        const connectionId = uuidv4();
        const connectionInfo = {
            testId,
            ip: req.socket.remoteAddress,
            connectedAt: new Date(),
            ws
        };
        activeConnections.set(connectionId, connectionInfo);

        // Send connection info
        ws.send(JSON.stringify({
            type: 'connection',
            message: 'WebSocket connection established',
            connectionId,
            timestamp: new Date().toISOString()
        }));

        // Heartbeat
        const heartbeatInterval = setInterval(() => {
            if (ws.readyState === ws.OPEN) {
                ws.ping();
            }
        }, 30000);

        // Real-time data updates
        const dataInterval = setInterval(() => {
            if (ws.readyState === ws.OPEN) {
                session.analytics.messagesSent++;
                ws.send(JSON.stringify({
                    type: 'update',
                    timestamp: new Date().toISOString(),
                    metrics: {
                        connections: wss.clients.size,
                        memory: process.memoryUsage().rss / 1024 / 1024,
                        yourConnectionDuration: `${(new Date() - connectionInfo.connectedAt) / 1000}s`
                    }
                }));
            }
        }, 2000);

        ws.on('pong', () => {
            // Update last active time
            connectionInfo.lastActive = new Date();
        });

        ws.on('message', (message) => {
            try {
                const data = JSON.parse(message);
                
                ws.send(JSON.stringify({
                    type: 'ack',
                    messageId: data.messageId || null,
                    receivedAt: new Date().toISOString()
                }));

                session.testResults.push({
                    endpoint: 'WebSocket',
                    timestamp: new Date(),
                    action: 'message',
                    content: data
                });
            } catch (error) {
                ws.send(JSON.stringify({
                    type: 'error',
                    message: 'Invalid message format',
                    expectedFormat: { messageId: 'string', data: 'any' }
                }));
            }
        });

        ws.on('close', () => {
            clearInterval(heartbeatInterval);
            clearInterval(dataInterval);
            const connection = activeConnections.get(connectionId);
            activeConnections.delete(connectionId);
            
            if (connection) {
                session.testResults.push({
                    endpoint: 'WebSocket',
                    timestamp: new Date(),
                    action: 'disconnected',
                    duration: `${(new Date() - connection.connectedAt) / 1000}s`
                });
            }
        });

        ws.on('error', (error) => {
            console.error('WebSocket error:', error);
        });
    } catch (error) {
        console.error('Connection setup error:', error);
        ws.close(1011, 'Server error');
    }
});

// ======================
// Management Endpoints
// ======================

// View test results
app.get('/api/test/results/:testId', (req, res) => {
    const session = verifyTestSession(req.params.testId, req.query.code);
    if (!session) return res.status(401).json({ error: 'Invalid credentials' });

    res.json({
        phoneNumber: session.phoneNumber,
        createdAt: session.createdAt,
        analytics: session.analytics,
        recentActivity: session.testResults.slice(-5),
        activeConnections: Array.from(activeConnections.values())
                            .filter(c => c.testId === req.params.testId).length
    });
});

// End test session
app.post('/api/test/end-session/:testId', (req, res) => {
    const session = verifyTestSession(req.params.testId, req.query.code);
    if (!session) return res.status(401).json({ error: 'Invalid credentials' });

    session.active = false;
    res.json({
        status: 'session ended',
        totalRequests: session.analytics.restCalls,
        totalMessages: session.analytics.messagesSent,
        duration: `${(new Date() - session.createdAt) / 1000} seconds`
    });
});

// ======================
// Graceful Shutdown
// ======================
const shutdown = async () => {
    console.log('\nStarting graceful shutdown...');
    
    try {
        // Close WebSocket connections
        console.log('Closing WebSocket connections...');
        wss.clients.forEach(client => {
            if (client.readyState === client.OPEN) {
                client.close(1001, 'Server shutting down');
            }
        });
        
        // Close the WebSocket server
        await new Promise(resolve => wss.close(resolve));
        
        // Close the HTTP server
        console.log('Closing HTTP server...');
        await new Promise(resolve => server.close(resolve));
        
        console.log('Cleanup complete. Exiting process.');
        process.exit(0);
    } catch (error) {
        console.error('Error during shutdown:', error);
        process.exit(1);
    }
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// ======================
// Helper Functions
// ======================
function verifyTestSession(testId, code) {
    if (!testId || !code) return null;
    const session = testSessions.get(testId);
    if (!session || !session.active || session.accessCode !== code) return null;
    return session;
}

// Global error handler middleware
app.use((error, req, res, next) => {
    console.error('API error:', error);
    res.status(500).json({
        error: 'Internal server error',
        requestId: req.id
    });
});