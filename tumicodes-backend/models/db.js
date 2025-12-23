// models/db.js - Database connection and initialization for PostgreSQL
const { Pool } = require('pg');
require('dotenv').config();

let pool;

// Create PostgreSQL connection pool
function createPool() {
    pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: {
            rejectUnauthorized: false  // REQUIRED for Render PostgreSQL
        },
        max: process.env.DB_CONNECTION_LIMIT || 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000
    });

    // Test connection
    pool.connect()
        .then(client => {
            console.log('✅ Connected to PostgreSQL database');
            client.release();
        })
        .catch(error => {
            console.error('❌ Database connection error:', error.message);
            setTimeout(createPool, 5000); // Retry connection
        });

    return pool;
}

// Get database connection
async function getConnection() {
    if (!pool) {
        pool = createPool();
    }
    return await pool.connect();
}

// Execute query with parameters
async function executeQuery(sql, params = []) {
    let client;
    try {
        client = await getConnection();
        const result = await client.query(sql, params);
        return result.rows;
    } catch (error) {
        console.error('Database query error:', error);
        throw error;
    } finally {
        if (client) client.release();
    }
}

// Initialize database tables for PostgreSQL
async function initializeDatabase() {
    try {
        const client = await getConnection();
        
        // Create users table
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                email VARCHAR(255) UNIQUE NOT NULL,
                name VARCHAR(255),
                password VARCHAR(255) NOT NULL,
                role VARCHAR(50) DEFAULT 'user',
                avatar_url VARCHAR(500),
                bio TEXT,
                xp INTEGER DEFAULT 0,
                level INTEGER DEFAULT 1,
                streak INTEGER DEFAULT 0,
                last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                email_verified BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Create courses table
        await client.query(`
            CREATE TABLE IF NOT EXISTS courses (
                id SERIAL PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                slug VARCHAR(255) UNIQUE NOT NULL,
                description TEXT,
                short_description VARCHAR(500),
                category VARCHAR(100),
                difficulty VARCHAR(50) DEFAULT 'beginner',
                price DECIMAL(10, 2) DEFAULT 0.00,
                discounted_price DECIMAL(10, 2),
                thumbnail_url VARCHAR(500),
                video_url VARCHAR(500),
                duration INTEGER DEFAULT 0,
                rating DECIMAL(3, 2) DEFAULT 0.00,
                total_ratings INTEGER DEFAULT 0,
                total_students INTEGER DEFAULT 0,
                is_featured BOOLEAN DEFAULT FALSE,
                is_published BOOLEAN DEFAULT TRUE,
                instructor_id INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (instructor_id) REFERENCES users(id) ON DELETE SET NULL
            );
        `);

        // Create user_courses table
        await client.query(`
            CREATE TABLE IF NOT EXISTS user_courses (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                course_id INTEGER NOT NULL,
                progress INTEGER DEFAULT 0,
                completed BOOLEAN DEFAULT FALSE,
                current_lesson_id INTEGER,
                started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                completed_at TIMESTAMP,
                last_accessed TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                rating INTEGER,
                review TEXT,
                UNIQUE(user_id, course_id),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
            );
        `);

        // Create lessons table
        await client.query(`
            CREATE TABLE IF NOT EXISTS lessons (
                id SERIAL PRIMARY KEY,
                course_id INTEGER NOT NULL,
                title VARCHAR(255) NOT NULL,
                slug VARCHAR(255) NOT NULL,
                content TEXT,
                video_url VARCHAR(500),
                duration INTEGER DEFAULT 0,
                sort_order INTEGER DEFAULT 0,
                is_free BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
                UNIQUE(course_id, slug)
            );
        `);

        // Create certificates table
        await client.query(`
            CREATE TABLE IF NOT EXISTS certificates (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                course_id INTEGER NOT NULL,
                certificate_id VARCHAR(100) UNIQUE NOT NULL,
                full_name VARCHAR(255) NOT NULL,
                course_title VARCHAR(255) NOT NULL,
                issue_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                expiry_date TIMESTAMP,
                download_url VARCHAR(500),
                verification_url VARCHAR(500),
                is_verified BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
            );
        `);

        // Create projects table
        await client.query(`
            CREATE TABLE IF NOT EXISTS projects (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                title VARCHAR(255) NOT NULL,
                slug VARCHAR(255) UNIQUE NOT NULL,
                description TEXT,
                thumbnail_url VARCHAR(500),
                github_url VARCHAR(500),
                live_url VARCHAR(500),
                tags JSONB,
                status VARCHAR(50) DEFAULT 'planning',
                progress INTEGER DEFAULT 0,
                is_public BOOLEAN DEFAULT TRUE,
                views_count INTEGER DEFAULT 0,
                likes_count INTEGER DEFAULT 0,
                collaborators JSONB,
                started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                completed_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );
        `);

        // Create notifications table
        await client.query(`
            CREATE TABLE IF NOT EXISTS notifications (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                type VARCHAR(50) DEFAULT 'info',
                title VARCHAR(255) NOT NULL,
                message TEXT NOT NULL,
                icon VARCHAR(50),
                data JSONB,
                is_read BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                read_at TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );
        `);

        // Create payments table
        await client.query(`
            CREATE TABLE IF NOT EXISTS payments (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                course_id INTEGER,
                amount DECIMAL(10, 2) NOT NULL,
                currency VARCHAR(10) DEFAULT 'USD',
                status VARCHAR(50) DEFAULT 'pending',
                payment_method VARCHAR(50),
                payment_gateway VARCHAR(50),
                transaction_id VARCHAR(100) UNIQUE,
                gateway_response JSONB,
                metadata JSONB,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE SET NULL
            );
        `);

        // Create user_skills table
        await client.query(`
            CREATE TABLE IF NOT EXISTS user_skills (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                skill_name VARCHAR(100) NOT NULL,
                skill_level INTEGER DEFAULT 0,
                experience_years DECIMAL(3, 1) DEFAULT 0,
                projects_count INTEGER DEFAULT 0,
                is_verified BOOLEAN DEFAULT FALSE,
                verified_by INTEGER,
                verified_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (verified_by) REFERENCES users(id) ON DELETE SET NULL,
                UNIQUE(user_id, skill_name)
            );
        `);

        // Create achievements table
        await client.query(`
            CREATE TABLE IF NOT EXISTS achievements (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                name VARCHAR(255) NOT NULL,
                description TEXT,
                icon VARCHAR(50),
                points INTEGER DEFAULT 0,
                category VARCHAR(50),
                earned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );
        `);

        // Create activities table
        await client.query(`
            CREATE TABLE IF NOT EXISTS activities (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                type VARCHAR(50) NOT NULL,
                title VARCHAR(255) NOT NULL,
                description TEXT,
                reference_id INTEGER,
                reference_type VARCHAR(50),
                metadata JSONB,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );
        `);

        // Create chat_messages table
        await client.query(`
            CREATE TABLE IF NOT EXISTS chat_messages (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                message TEXT NOT NULL,
                response TEXT,
                is_ai BOOLEAN DEFAULT FALSE,
                tokens_used INTEGER DEFAULT 0,
                model VARCHAR(50),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );
        `);

        // Create user_sessions table
        await client.query(`
            CREATE TABLE IF NOT EXISTS user_sessions (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                session_token VARCHAR(255) UNIQUE NOT NULL,
                ip_address VARCHAR(45),
                user_agent TEXT,
                expires_at TIMESTAMP NOT NULL,
                last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );
        `);

        // Create course_categories table
        await client.query(`
            CREATE TABLE IF NOT EXISTS course_categories (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                slug VARCHAR(100) UNIQUE NOT NULL,
                description TEXT,
                icon VARCHAR(50),
                color VARCHAR(20),
                sort_order INTEGER DEFAULT 0,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Create indexes for performance
        await client.query('CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);');
        await client.query('CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);');
        await client.query('CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);');
        await client.query('CREATE INDEX IF NOT EXISTS idx_courses_slug ON courses(slug);');
        await client.query('CREATE INDEX IF NOT EXISTS idx_courses_category ON courses(category);');
        await client.query('CREATE INDEX IF NOT EXISTS idx_courses_is_published ON courses(is_published);');
        await client.query('CREATE INDEX IF NOT EXISTS idx_user_courses_user_id ON user_courses(user_id);');
        await client.query('CREATE INDEX IF NOT EXISTS idx_user_courses_completed ON user_courses(completed);');
        await client.query('CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);');
        await client.query('CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);');
        await client.query('CREATE INDEX IF NOT EXISTS idx_activities_user_id ON activities(user_id);');
        await client.query('CREATE INDEX IF NOT EXISTS idx_activities_created_at ON activities(created_at);');

        // Insert default categories (using ON CONFLICT for PostgreSQL)
        const categories = [
            ['Web Development', 'web-development', 'Learn to build modern websites and web applications', 'code', '#FF003C', 1],
            ['Mobile Development', 'mobile-development', 'Build iOS and Android applications', 'mobile', '#00D4FF', 2],
            ['Data Science', 'data-science', 'Master data analysis and machine learning', 'chart-line', '#9D00FF', 3],
            ['DevOps', 'devops', 'Learn deployment and infrastructure management', 'server', '#00FF9D', 4],
            ['UI/UX Design', 'ui-ux-design', 'Design beautiful user interfaces', 'paint-brush', '#FFD700', 5],
            ['Cybersecurity', 'cybersecurity', 'Learn to protect systems and networks', 'shield-alt', '#FF6B6B', 6]
        ];

        for (const [name, slug, description, icon, color, order] of categories) {
            await client.query(
                `INSERT INTO course_categories (name, slug, description, icon, color, sort_order) 
                 VALUES ($1, $2, $3, $4, $5, $6) 
                 ON CONFLICT (slug) DO NOTHING`,
                [name, slug, description, icon, color, order]
            );
        }

        // Create admin user if not exists
        const adminEmail = process.env.ADMIN_EMAIL || 'tumicodes@gmail.com';
        const adminPassword = process.env.ADMIN_PASSWORD || 'tumicodes25';
        
        const adminResult = await client.query(
            'SELECT id FROM users WHERE email = $1',
            [adminEmail]
        );

        if (adminResult.rows.length === 0) {
            const bcrypt = require('bcryptjs');
            const hashedPassword = await bcrypt.hash(adminPassword, 12);
            
            const insertResult = await client.query(
                'INSERT INTO users (email, name, password, role, email_verified) VALUES ($1, $2, $3, $4, $5) RETURNING id',
                [adminEmail, 'TumiCodes Admin', hashedPassword, 'admin', true]
            );
            
            const adminId = insertResult.rows[0].id;
            
            // Add admin achievements
            await client.query(
                'INSERT INTO achievements (user_id, name, description, icon, points, category) VALUES ($1, $2, $3, $4, $5, $6)',
                [adminId, 'Founding Member', 'Joined TumiCodes as an admin', 'crown', 1000, 'special']
            );
            
            console.log('✅ Admin user created successfully');
        }

        // Insert sample courses if none exist
        const courseResult = await client.query('SELECT COUNT(*) as count FROM courses');
        if (parseInt(courseResult.rows[0].count) === 0) {
            const sampleCourses = [
                [
                    'Complete Web Development Bootcamp 2024',
                    'web-development-bootcamp-2024',
                    'Learn web development from scratch. HTML, CSS, JavaScript, React, Node.js, MongoDB and more!',
                    'Become a full-stack web developer with this comprehensive course',
                    'web-development',
                    'beginner',
                    99.99,
                    79.99,
                    'https://images.unsplash.com/photo-1498050108023-c5249f4df085',
                    'https://youtube.com/embed/sample',
                    4800,
                    4.8,
                    1250,
                    5000,
                    true,
                    true,
                    null
                ],
                [
                    'Machine Learning for Beginners',
                    'machine-learning-beginners',
                    'Start your journey into machine learning with Python',
                    'Learn the fundamentals of machine learning and AI',
                    'data-science',
                    'beginner',
                    89.99,
                    69.99,
                    'https://images.unsplash.com/photo-1555949963-aa79dcee981c',
                    'https://youtube.com/embed/sample2',
                    3600,
                    4.7,
                    890,
                    3200,
                    true,
                    true,
                    null
                ],
                [
                    'Advanced React Patterns',
                    'advanced-react-patterns',
                    'Master advanced React concepts and patterns',
                    'Take your React skills to the next level',
                    'web-development',
                    'advanced',
                    79.99,
                    59.99,
                    'https://images.unsplash.com/photo-1633356122544-f134324a6cee',
                    'https://youtube.com/embed/sample3',
                    1800,
                    4.9,
                    450,
                    1800,
                    false,
                    true,
                    null
                ]
            ];

            for (const course of sampleCourses) {
                await client.query(
                    `INSERT INTO courses (
                        title, slug, description, short_description, category, difficulty, 
                        price, discounted_price, thumbnail_url, video_url, duration, 
                        rating, total_ratings, total_students, is_featured, is_published, instructor_id
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
                    course
                );
            }
            console.log('✅ Sample courses created');
        }

        console.log('✅ PostgreSQL database tables created successfully');
        client.release();
    } catch (error) {
        console.error('❌ Database initialization error:', error);
        throw error;
    }
}

module.exports = {
    pool,
    createPool,
    getConnection,
    executeQuery,
    initializeDatabase
};
