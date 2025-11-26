"""
NataBridge Database Schema and Initialization
"""

import os
import psycopg
from datetime import datetime
from werkzeug.security import generate_password_hash

def get_db_connection():
    return psycopg.connect(os.environ.get('DATABASE_URL'))

def hash_password(password):
    return generate_password_hash(password)

def init_database():
    """Initialize database with all required tables"""
    
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            # Users table
            cur.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id SERIAL PRIMARY KEY,
                    email VARCHAR(255) UNIQUE,
                    phone VARCHAR(20) UNIQUE,
                    password VARCHAR(255) NOT NULL,
                    full_name VARCHAR(255) NOT NULL,
                    role VARCHAR(50) NOT NULL DEFAULT 'mother',
                    google_id VARCHAR(255),
                    profile_picture TEXT,
                    phc_id INTEGER,
                    is_active BOOLEAN DEFAULT TRUE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    CONSTRAINT valid_role CHECK (role IN ('phc_admin', 'phc_staff', 'chw', 'mother'))
                )
            """)
            
            # Mothers table
            cur.execute("""
                CREATE TABLE IF NOT EXISTS mothers (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER REFERENCES users(id),
                    full_name VARCHAR(255) NOT NULL,
                    age INTEGER,
                    phone VARCHAR(20),
                    address TEXT,
                    lga_community VARCHAR(255),
                    parity INTEGER DEFAULT 0,
                    gravidity INTEGER DEFAULT 0,
                    previous_outcomes TEXT,
                    pre_existing_conditions TEXT,
                    current_pregnancy_details TEXT,
                    anc_history TEXT,
                    next_appointment DATE,
                    risk_level VARCHAR(50) DEFAULT 'normal',
                    last_triage_date TIMESTAMP,
                    registered_by INTEGER REFERENCES users(id),
                    phc_id INTEGER,
                    device_assigned BOOLEAN DEFAULT FALSE,
                    device_id VARCHAR(100),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    CONSTRAINT valid_risk_level CHECK (risk_level IN ('normal', 'caution', 'high_risk', 'emergency'))
                )
            """)
            
            # Triage records table
            cur.execute("""
                CREATE TABLE IF NOT EXISTS triage_records (
                    id SERIAL PRIMARY KEY,
                    mother_id INTEGER REFERENCES mothers(id) ON DELETE CASCADE,
                    symptoms JSONB,
                    blood_pressure_systolic INTEGER,
                    blood_pressure_diastolic INTEGER,
                    heart_rate INTEGER,
                    temperature DECIMAL(4,1),
                    spo2 INTEGER,
                    risk_score INTEGER,
                    risk_level VARCHAR(50),
                    notes TEXT,
                    assessed_by INTEGER REFERENCES users(id),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            
            # CHW Assignments table
            cur.execute("""
                CREATE TABLE IF NOT EXISTS chw_assignments (
                    id SERIAL PRIMARY KEY,
                    mother_id INTEGER REFERENCES mothers(id) ON DELETE CASCADE UNIQUE,
                    chw_id INTEGER REFERENCES users(id),
                    priority VARCHAR(50) DEFAULT 'normal',
                    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    CONSTRAINT valid_priority CHECK (priority IN ('normal', 'caution', 'high_risk', 'emergency'))
                )
            """)
            
            # Home visits table
            cur.execute("""
                CREATE TABLE IF NOT EXISTS home_visits (
                    id SERIAL PRIMARY KEY,
                    mother_id INTEGER REFERENCES mothers(id) ON DELETE CASCADE,
                    chw_id INTEGER REFERENCES users(id),
                    visit_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    symptoms_observed JSONB,
                    mother_condition VARCHAR(100),
                    danger_signs JSONB,
                    vitals JSONB,
                    referral_needed BOOLEAN DEFAULT FALSE,
                    referral_reason TEXT,
                    education_provided JSONB,
                    notes TEXT,
                    next_visit_date DATE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            
            # Emergency alerts table
            cur.execute("""
                CREATE TABLE IF NOT EXISTS emergency_alerts (
                    id SERIAL PRIMARY KEY,
                    mother_id INTEGER REFERENCES mothers(id) ON DELETE CASCADE,
                    alert_type VARCHAR(50) DEFAULT 'emergency',
                    description TEXT,
                    location_lat DECIMAL(10, 8),
                    location_lng DECIMAL(11, 8),
                    location_address TEXT,
                    status VARCHAR(50) DEFAULT 'active',
                    responder_id INTEGER REFERENCES users(id),
                    response_notes TEXT,
                    created_by INTEGER REFERENCES users(id),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    resolved_at TIMESTAMP,
                    CONSTRAINT valid_status CHECK (status IN ('active', 'responding', 'resolved', 'cancelled'))
                )
            """)
            
            # Referrals table
            cur.execute("""
                CREATE TABLE IF NOT EXISTS referrals (
                    id SERIAL PRIMARY KEY,
                    mother_id INTEGER REFERENCES mothers(id) ON DELETE CASCADE,
                    from_facility VARCHAR(255),
                    to_facility VARCHAR(255),
                    reason TEXT,
                    urgency VARCHAR(50) DEFAULT 'routine',
                    clinical_notes TEXT,
                    transport_arranged BOOLEAN DEFAULT FALSE,
                    transport_type VARCHAR(100),
                    transport_contact VARCHAR(100),
                    status VARCHAR(50) DEFAULT 'pending',
                    referred_by INTEGER REFERENCES users(id),
                    received_by INTEGER REFERENCES users(id),
                    outcome TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    completed_at TIMESTAMP,
                    CONSTRAINT valid_urgency CHECK (urgency IN ('routine', 'urgent', 'emergency')),
                    CONSTRAINT valid_ref_status CHECK (status IN ('pending', 'in_transit', 'received', 'completed', 'cancelled'))
                )
            """)
            
            # Transport contacts table
            cur.execute("""
                CREATE TABLE IF NOT EXISTS transport_contacts (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR(255) NOT NULL,
                    type VARCHAR(100) NOT NULL,
                    phone VARCHAR(20) NOT NULL,
                    alternate_phone VARCHAR(20),
                    lga_community VARCHAR(255),
                    vehicle_type VARCHAR(100),
                    availability TEXT,
                    is_active BOOLEAN DEFAULT TRUE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            
            # Education modules table
            cur.execute("""
                CREATE TABLE IF NOT EXISTS education_modules (
                    id SERIAL PRIMARY KEY,
                    title VARCHAR(255) NOT NULL,
                    category VARCHAR(100) NOT NULL,
                    language VARCHAR(50) DEFAULT 'english',
                    content TEXT NOT NULL,
                    audio_url TEXT,
                    image_url TEXT,
                    duration_minutes INTEGER,
                    order_index INTEGER DEFAULT 0,
                    is_active BOOLEAN DEFAULT TRUE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            
            # NataBand readings table
            cur.execute("""
                CREATE TABLE IF NOT EXISTS nataband_readings (
                    id SERIAL PRIMARY KEY,
                    mother_id INTEGER REFERENCES mothers(id) ON DELETE CASCADE,
                    device_id VARCHAR(100),
                    heart_rate INTEGER,
                    blood_pressure_systolic INTEGER,
                    blood_pressure_diastolic INTEGER,
                    temperature DECIMAL(4,1),
                    spo2 INTEGER,
                    activity_level VARCHAR(50),
                    reading_source VARCHAR(50) DEFAULT 'manual',
                    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            
            # Notifications table
            cur.execute("""
                CREATE TABLE IF NOT EXISTS notifications (
                    id SERIAL PRIMARY KEY,
                    type VARCHAR(100) NOT NULL,
                    title VARCHAR(255) NOT NULL,
                    message TEXT,
                    mother_id INTEGER REFERENCES mothers(id) ON DELETE CASCADE,
                    target_user_id INTEGER REFERENCES users(id),
                    target_role VARCHAR(50),
                    priority VARCHAR(50) DEFAULT 'normal',
                    is_read BOOLEAN DEFAULT FALSE,
                    read_at TIMESTAMP,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    CONSTRAINT valid_notif_priority CHECK (priority IN ('low', 'normal', 'high', 'critical'))
                )
            """)
            
            # Create indexes
            cur.execute("CREATE INDEX IF NOT EXISTS idx_mothers_risk ON mothers(risk_level)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_mothers_phone ON mothers(phone)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_triage_mother ON triage_records(mother_id)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_visits_mother ON home_visits(mother_id)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_alerts_status ON emergency_alerts(status)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(is_read)")
            
            conn.commit()
            print("Database tables created successfully!")

def seed_initial_data():
    """Seed initial users and sample data"""
    
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            # Check if admin exists
            cur.execute("SELECT id FROM users WHERE email = 'admin@natabridge.com'")
            if not cur.fetchone():
                # Create default admin user
                cur.execute("""
                    INSERT INTO users (email, phone, password, full_name, role)
                    VALUES (%s, %s, %s, %s, %s)
                """, (
                    'admin@natabridge.com',
                    '08012345678',
                    hash_password('admin123'),
                    'PHC Administrator',
                    'phc_admin'
                ))
                
                # Create default CHW user
                cur.execute("""
                    INSERT INTO users (email, phone, password, full_name, role)
                    VALUES (%s, %s, %s, %s, %s)
                """, (
                    'chw@natabridge.com',
                    '08012345679',
                    hash_password('chw123'),
                    'Community Health Worker',
                    'chw'
                ))
                
                # Create default mother user
                cur.execute("""
                    INSERT INTO users (email, phone, password, full_name, role)
                    VALUES (%s, %s, %s, %s, %s)
                """, (
                    'mother@natabridge.com',
                    '08012345680',
                    hash_password('mother123'),
                    'Test Mother',
                    'mother'
                ))
            
            # Seed transport contacts
            cur.execute("SELECT id FROM transport_contacts LIMIT 1")
            if not cur.fetchone():
                transport_contacts = [
                    ('Keke Mama Express', 'tricycle', '08011111111', 'Lagos Island', 'Tricycle/Keke'),
                    ('Community Ambulance', 'ambulance', '08022222222', 'All Areas', 'Ambulance'),
                    ('PHC Emergency Van', 'ambulance', '08033333333', 'All Areas', 'Van'),
                    ('Okada Quick Response', 'motorcycle', '08044444444', 'Lagos Mainland', 'Motorcycle'),
                    ('Uber Health Partner', 'car', '08055555555', 'All Areas', 'Car')
                ]
                
                for name, type_, phone, area, vehicle in transport_contacts:
                    cur.execute("""
                        INSERT INTO transport_contacts (name, type, phone, lga_community, vehicle_type)
                        VALUES (%s, %s, %s, %s, %s)
                    """, (name, type_, phone, area, vehicle))
            
            # Seed education modules
            cur.execute("SELECT id FROM education_modules LIMIT 1")
            if not cur.fetchone():
                education_content = [
                    # English modules
                    ('Why ANC Matters', 'anc_importance', 'english', 
                     'Antenatal Care (ANC) visits are essential for a healthy pregnancy. During these visits, healthcare providers monitor your health and your baby\'s development, screen for potential problems, and provide important information about nutrition, exercise, and what to expect during labor and delivery. Regular ANC visits can help detect and treat problems early, reducing risks for both mother and baby.', 1),
                    ('Recognizing Danger Signs', 'danger_signs', 'english',
                     'Learn to recognize these warning signs that require immediate medical attention: Severe headache with blurred vision, Vaginal bleeding, High fever, Severe abdominal pain, Reduced or no fetal movement, Water breaking early, Swelling of face and hands, Convulsions or fits, Difficulty breathing. If you experience any of these, seek help immediately!', 1),
                    ('Nutrition During Pregnancy', 'nutrition', 'english',
                     'Good nutrition is crucial during pregnancy. Eat a balanced diet including: Iron-rich foods (leafy greens, beans, meat), Folic acid (vegetables, fruits, fortified cereals), Calcium (milk, yogurt, cheese), Protein (eggs, fish, poultry, legumes). Stay hydrated and avoid alcohol, raw fish, and unpasteurized products.', 1),
                    ('Preparing for Birth', 'birth_preparedness', 'english',
                     'Birth preparedness plan includes: Identifying where you will give birth, Arranging transportation, Saving money for delivery costs, Identifying blood donors, Packing a delivery bag with essentials, Knowing danger signs, Having a communication plan, Identifying who will accompany you.', 1),
                    ('Caring for Your Newborn', 'newborn_care', 'english',
                     'Essential newborn care: Start breastfeeding within the first hour, Keep baby warm using skin-to-skin contact, Keep the umbilical cord clean and dry, Watch for danger signs (fever, poor feeding, yellow skin), Schedule newborn checkups, Ensure proper immunization schedule.', 1),
                    
                    # Yoruba modules
                    ('Kini idi ti ANC se pataki', 'anc_importance', 'yoruba',
                     'Itoju oyun (ANC) je ohun pataki fun oyun ti o dara. Lakoko abẹwo wọnyi, awọn olupese ilera n ṣe abojuto ilera rẹ ati idagbasoke ọmọ rẹ, ṣayẹwo fun awọn iṣoro ti o le wa, ati pese alaye pataki nipa ounjẹ, ere idaraya, ati ohun ti o nireti lakoko iṣẹ ati ibimọ.', 1),
                    ('Awọn ami Ewu', 'danger_signs', 'yoruba',
                     'Ko awọn ami ikilọ wọnyi ti o nilo akiyesi ilera lẹsẹkẹsẹ: Orififo nla pẹlu iran blurry, Ẹjẹ abẹ, Iba giga, Irora inu nla, Išẹ ọmọ ti o dinku, Omi fifọ ni kutukutu, Wiwu oju ati ọwọ, Giri, Iṣoro mimi. Ti o ba ni iriri eyikeyi ninu iwọnyi, wa iranlọwọ lẹsẹkẹsẹ!', 1),
                    
                    # Hausa modules
                    ('Me yasa ANC ke da Muhimmanci', 'anc_importance', 'hausa',
                     'Kulawar ciki (ANC) yana da matukar muhimmanci don samun lafiyayyar ciki. A lokacin wadannan ziyarori, masu ba da sabis na lafiya suna sa ido kan lafiyar ku da ci gaban jaririn ku, suna duba matsalolin da za su iya faruwa, kuma suna ba da muhimman bayanai game da abinci mai gina jiki.', 1),
                    ('Alamomin Hadari', 'danger_signs', 'hausa',
                     'Koyi gane wadannan alamomin gargadi da suke bukatar kulawar likita nan take: Ciwon kai mai tsanani tare da gani maras kyau, Zubar jini, Zazzabi mai zafi, Ciwo mai tsanani, Raguwar motsi jariri, Fasa ruwa da wuri, Kumburi fuska da hannuwa, Farfadiya, Wahalar numfashi.', 1),
                    
                    # Igbo modules
                    ('Gịnị kpatara ANC ji dị mkpa', 'anc_importance', 'igbo',
                     'Nlekọta ime (ANC) dị oke mkpa maka ime dị mma. N\'oge nleta ndị a, ndị na-enye ọrụ ahụike na-elekọta ahụike gị na mmepe nwa gị, na-enyocha maka nsogbu nwere ike ịdị, ma nye ozi dị mkpa gbasara nri, mmega ahụ, na ihe ị ga-atụ anya n\'oge ịmụ nwa.', 1),
                    ('Ihe Ịrịba Ama Egwu', 'danger_signs', 'igbo',
                     'Mụta ịmata ihe ndị a dị ize ndụ nke chọrọ nlekọta ahụike ozugbo: Isi ọwụwa siri ike na anya gbagwojuru anya, Ọbara na-asọpụta, Oke ọkụ ahụ, Oke mgbu afọ, Mbelata ma ọ bụ enweghị mmegharị nwa, Mmiri mmebi n\'oge, Otito ihu na aka, Ọgba aghara, Nsogbu iku ume. Ọ bụrụ na ị nwere nke ọ bụla n\'ime ndị a, chọọ enyemaka ozugbo!', 1),
                    
                    # Pidgin modules
                    ('Why ANC Dey Important', 'anc_importance', 'pidgin',
                     'Antenatal Care (ANC) visit dey very important for healthy belle. For these visits, doctor people go check your health and how your pikin dey grow, look for any wahala wey fit happen, and give you important gist about food, exercise, and wetin go happen when you wan born. Regular ANC visit fit help catch problem early early.', 1),
                    ('Danger Signs Wey You Suppose Know', 'danger_signs', 'pidgin',
                     'Learn to know these warning signs wey need doctor attention sharp sharp: Strong headache with eye wey no dey see well, Blood wey dey comot for down, High fever, Strong belle pain, Pikin wey no dey move again, Water wey break before time, Face and hand wey swell, Convulsion or fit, Wahala to breathe. If you see any of these ones, find help sharp sharp!', 1)
                ]
                
                for title, category, language, content, order in education_content:
                    cur.execute("""
                        INSERT INTO education_modules (title, category, language, content, order_index)
                        VALUES (%s, %s, %s, %s, %s)
                    """, (title, category, language, content, order))
            
            conn.commit()
            print("Initial data seeded successfully!")

if __name__ == '__main__':
    print("Initializing NataBridge database...")
    init_database()
    seed_initial_data()
    print("Database initialization complete!")
