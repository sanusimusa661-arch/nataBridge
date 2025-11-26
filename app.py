"""
NataBridge PWA - Maternal Healthcare Progressive Web App
Main Flask Application
"""

import os
import json
import psycopg
from datetime import datetime, timedelta
from functools import wraps
from flask import Flask, request, jsonify, render_template, send_from_directory, make_response
import secrets
import jwt
from werkzeug.security import generate_password_hash, check_password_hash

app = Flask(__name__, static_folder='static', template_folder='templates')
app.config['SECRET_KEY'] = os.environ.get('SESSION_SECRET', secrets.token_hex(32))

# Database connection
def get_db_connection():
    return psycopg.connect(os.environ.get('DATABASE_URL'))

# JWT Token Management
def generate_token(user_id, role):
    payload = {
        'user_id': user_id,
        'role': role,
        'exp': datetime.utcnow() + timedelta(days=7),
        'iat': datetime.utcnow()
    }
    return jwt.encode(payload, app.config['SECRET_KEY'], algorithm='HS256')

def verify_token(token):
    try:
        payload = jwt.decode(token, app.config['SECRET_KEY'], algorithms=['HS256'])
        return payload
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None

def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get('Authorization')
        if not token:
            return jsonify({'error': 'Token is missing'}), 401
        
        if token.startswith('Bearer '):
            token = token[7:]
        
        payload = verify_token(token)
        if not payload:
            return jsonify({'error': 'Invalid or expired token'}), 401
        
        request.user = payload
        return f(*args, **kwargs)
    return decorated

def role_required(roles):
    def decorator(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            if request.user['role'] not in roles:
                return jsonify({'error': 'Access denied'}), 403
            return f(*args, **kwargs)
        return decorated
    return decorator

def hash_password(password):
    return generate_password_hash(password)

def verify_password(password, password_hash):
    return check_password_hash(password_hash, password)

# ============ PWA Routes ============
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/manifest.json')
def manifest():
    return send_from_directory('static', 'manifest.json')

@app.route('/sw.js')
def service_worker():
    response = make_response(send_from_directory('static', 'sw.js'))
    response.headers['Content-Type'] = 'application/javascript'
    response.headers['Service-Worker-Allowed'] = '/'
    return response

# ============ Authentication Routes ============
@app.route('/api/auth/register', methods=['POST'])
def register():
    data = request.json
    email = data.get('email')
    phone = data.get('phone')
    password = data.get('password')
    full_name = data.get('full_name')
    role = data.get('role', 'mother')
    
    if not password or not full_name:
        return jsonify({'error': 'Missing required fields'}), 400
    
    if not email and not phone:
        return jsonify({'error': 'Email or phone is required'}), 400
    
    hashed_password = hash_password(password)
    
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                # Check if user exists
                cur.execute("SELECT id FROM users WHERE email = %s OR phone = %s", (email, phone))
                if cur.fetchone():
                    return jsonify({'error': 'User already exists'}), 400
                
                cur.execute("""
                    INSERT INTO users (email, phone, password, full_name, role, created_at)
                    VALUES (%s, %s, %s, %s, %s, %s) RETURNING id
                """, (email, phone, hashed_password, full_name, role, datetime.utcnow()))
                user_id = cur.fetchone()[0]
                conn.commit()
                
                token = generate_token(user_id, role)
                return jsonify({
                    'message': 'Registration successful',
                    'token': token,
                    'user': {'id': user_id, 'full_name': full_name, 'role': role}
                }), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.json
    email = data.get('email')
    phone = data.get('phone')
    password = data.get('password')
    
    if not password:
        return jsonify({'error': 'Password is required'}), 400
    
    if not email and not phone:
        return jsonify({'error': 'Email or phone is required'}), 400
    
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                if email:
                    cur.execute("SELECT id, full_name, role, password FROM users WHERE email = %s", (email,))
                else:
                    cur.execute("SELECT id, full_name, role, password FROM users WHERE phone = %s", (phone,))
                
                user = cur.fetchone()
                if not user or not verify_password(password, user[3]):
                    return jsonify({'error': 'Invalid credentials'}), 401
                
                token = generate_token(user[0], user[2])
                return jsonify({
                    'message': 'Login successful',
                    'token': token,
                    'user': {'id': user[0], 'full_name': user[1], 'role': user[2]}
                })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/auth/me', methods=['GET'])
@token_required
def get_current_user():
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT id, email, phone, full_name, role FROM users WHERE id = %s", 
                           (request.user['user_id'],))
                user = cur.fetchone()
                if user:
                    return jsonify({
                        'id': user[0],
                        'email': user[1],
                        'phone': user[2],
                        'full_name': user[3],
                        'role': user[4]
                    })
                return jsonify({'error': 'User not found'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ============ Mother Registration Routes ============
@app.route('/api/mothers', methods=['POST'])
@token_required
@role_required(['phc_admin', 'phc_staff', 'chw'])
def register_mother():
    data = request.json
    
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO mothers (
                        full_name, age, phone, address, lga_community, parity, gravidity,
                        previous_outcomes, pre_existing_conditions, current_pregnancy_details,
                        anc_history, next_appointment, registered_by, phc_id, created_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    RETURNING id
                """, (
                    data.get('full_name'), data.get('age'), data.get('phone'),
                    data.get('address'), data.get('lga_community'), data.get('parity'),
                    data.get('gravidity'), data.get('previous_outcomes'),
                    data.get('pre_existing_conditions'), data.get('current_pregnancy_details'),
                    data.get('anc_history'), data.get('next_appointment'),
                    request.user['user_id'], data.get('phc_id'), datetime.utcnow()
                ))
                mother_id = cur.fetchone()[0]
                conn.commit()
                
                return jsonify({'message': 'Mother registered successfully', 'id': mother_id}), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/mothers', methods=['GET'])
@token_required
def get_mothers():
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                role = request.user['role']
                user_id = request.user['user_id']
                
                if role == 'mother':
                    # Mother sees only their own profile
                    cur.execute("""
                        SELECT m.* FROM mothers m
                        JOIN users u ON m.phone = u.phone OR m.user_id = u.id
                        WHERE u.id = %s
                    """, (user_id,))
                elif role == 'chw':
                    # CHW sees assigned mothers
                    cur.execute("""
                        SELECT m.* FROM mothers m
                        LEFT JOIN chw_assignments ca ON m.id = ca.mother_id
                        WHERE ca.chw_id = %s OR m.registered_by = %s
                    """, (user_id, user_id))
                else:
                    # PHC staff sees all mothers in their PHC
                    cur.execute("SELECT * FROM mothers ORDER BY created_at DESC")
                
                columns = [desc[0] for desc in cur.description]
                mothers = [dict(zip(columns, row)) for row in cur.fetchall()]
                
                # Convert datetime objects to strings
                for mother in mothers:
                    for key, value in mother.items():
                        if isinstance(value, datetime):
                            mother[key] = value.isoformat()
                
                return jsonify(mothers)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/mothers/<int:mother_id>', methods=['GET'])
@token_required
def get_mother(mother_id):
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT * FROM mothers WHERE id = %s", (mother_id,))
                row = cur.fetchone()
                if row:
                    columns = [desc[0] for desc in cur.description]
                    mother = dict(zip(columns, row))
                    for key, value in mother.items():
                        if isinstance(value, datetime):
                            mother[key] = value.isoformat()
                    return jsonify(mother)
                return jsonify({'error': 'Mother not found'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/mothers/<int:mother_id>', methods=['PUT'])
@token_required
@role_required(['phc_admin', 'phc_staff', 'chw'])
def update_mother(mother_id):
    data = request.json
    
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    UPDATE mothers SET
                        full_name = COALESCE(%s, full_name),
                        age = COALESCE(%s, age),
                        phone = COALESCE(%s, phone),
                        address = COALESCE(%s, address),
                        lga_community = COALESCE(%s, lga_community),
                        parity = COALESCE(%s, parity),
                        gravidity = COALESCE(%s, gravidity),
                        previous_outcomes = COALESCE(%s, previous_outcomes),
                        pre_existing_conditions = COALESCE(%s, pre_existing_conditions),
                        current_pregnancy_details = COALESCE(%s, current_pregnancy_details),
                        anc_history = COALESCE(%s, anc_history),
                        next_appointment = COALESCE(%s, next_appointment),
                        updated_at = %s
                    WHERE id = %s
                """, (
                    data.get('full_name'), data.get('age'), data.get('phone'),
                    data.get('address'), data.get('lga_community'), data.get('parity'),
                    data.get('gravidity'), data.get('previous_outcomes'),
                    data.get('pre_existing_conditions'), data.get('current_pregnancy_details'),
                    data.get('anc_history'), data.get('next_appointment'),
                    datetime.utcnow(), mother_id
                ))
                conn.commit()
                return jsonify({'message': 'Mother profile updated successfully'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ============ Triage & Risk Assessment Routes ============
@app.route('/api/triage', methods=['POST'])
@token_required
@role_required(['phc_admin', 'phc_staff', 'chw'])
def create_triage():
    data = request.json
    
    # Calculate risk score based on symptoms and vitals
    risk_score = calculate_risk_score(data)
    
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO triage_records (
                        mother_id, symptoms, blood_pressure_systolic, blood_pressure_diastolic,
                        heart_rate, temperature, spo2, risk_score, risk_level,
                        notes, assessed_by, created_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    RETURNING id
                """, (
                    data.get('mother_id'), json.dumps(data.get('symptoms', [])),
                    data.get('bp_systolic'), data.get('bp_diastolic'),
                    data.get('heart_rate'), data.get('temperature'),
                    data.get('spo2'), risk_score['score'], risk_score['level'],
                    data.get('notes'), request.user['user_id'], datetime.utcnow()
                ))
                triage_id = cur.fetchone()[0]
                
                # Update mother's risk level
                cur.execute("""
                    UPDATE mothers SET risk_level = %s, last_triage_date = %s WHERE id = %s
                """, (risk_score['level'], datetime.utcnow(), data.get('mother_id')))
                
                # If high risk or emergency, create alert
                if risk_score['level'] in ['high_risk', 'emergency']:
                    cur.execute("""
                        INSERT INTO notifications (
                            type, title, message, mother_id, priority, created_at
                        ) VALUES (%s, %s, %s, %s, %s, %s)
                    """, (
                        'high_risk_alert',
                        f"High Risk Alert - {risk_score['level'].upper()}",
                        f"Mother requires immediate attention. Risk factors: {', '.join(risk_score['factors'])}",
                        data.get('mother_id'),
                        'high' if risk_score['level'] == 'high_risk' else 'critical',
                        datetime.utcnow()
                    ))
                    
                    # Auto-assign to CHW for follow-up
                    cur.execute("""
                        INSERT INTO chw_assignments (mother_id, chw_id, priority, assigned_at)
                        SELECT %s, id, %s, %s FROM users WHERE role = 'chw' LIMIT 1
                        ON CONFLICT (mother_id) DO UPDATE SET priority = EXCLUDED.priority
                    """, (data.get('mother_id'), risk_score['level'], datetime.utcnow()))
                
                conn.commit()
                
                return jsonify({
                    'message': 'Triage completed',
                    'id': triage_id,
                    'risk_score': risk_score
                }), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500

def calculate_risk_score(data):
    score = 0
    factors = []
    
    symptoms = data.get('symptoms', [])
    
    # Danger signs scoring
    danger_signs = {
        'severe_headache': 15,
        'blurred_vision': 15,
        'convulsions': 25,
        'severe_abdominal_pain': 20,
        'vaginal_bleeding': 25,
        'fever': 10,
        'reduced_fetal_movement': 20,
        'swelling_face_hands': 10,
        'difficulty_breathing': 20,
        'chest_pain': 15,
        'severe_vomiting': 10,
        'water_breaking_early': 25
    }
    
    for symptom in symptoms:
        if symptom in danger_signs:
            score += danger_signs[symptom]
            factors.append(symptom.replace('_', ' ').title())
    
    # Vital signs scoring
    bp_systolic = data.get('bp_systolic')
    bp_diastolic = data.get('bp_diastolic')
    
    if bp_systolic:
        if bp_systolic >= 160 or bp_diastolic >= 110:
            score += 25
            factors.append('Severe Hypertension')
        elif bp_systolic >= 140 or bp_diastolic >= 90:
            score += 15
            factors.append('Hypertension')
        elif bp_systolic < 90 or bp_diastolic < 60:
            score += 15
            factors.append('Low Blood Pressure')
    
    heart_rate = data.get('heart_rate')
    if heart_rate:
        if heart_rate > 120 or heart_rate < 60:
            score += 10
            factors.append('Abnormal Heart Rate')
    
    temperature = data.get('temperature')
    if temperature:
        if temperature >= 38.5:
            score += 15
            factors.append('High Fever')
        elif temperature >= 37.5:
            score += 5
            factors.append('Mild Fever')
    
    spo2 = data.get('spo2')
    if spo2:
        if spo2 < 90:
            score += 25
            factors.append('Critical Oxygen Level')
        elif spo2 < 95:
            score += 10
            factors.append('Low Oxygen Level')
    
    # Determine risk level
    if score >= 50:
        level = 'emergency'
    elif score >= 30:
        level = 'high_risk'
    elif score >= 15:
        level = 'caution'
    else:
        level = 'normal'
    
    return {'score': score, 'level': level, 'factors': factors}

@app.route('/api/triage/history/<int:mother_id>', methods=['GET'])
@token_required
def get_triage_history(mother_id):
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT t.*, u.full_name as assessor_name
                    FROM triage_records t
                    LEFT JOIN users u ON t.assessed_by = u.id
                    WHERE t.mother_id = %s
                    ORDER BY t.created_at DESC
                """, (mother_id,))
                columns = [desc[0] for desc in cur.description]
                records = [dict(zip(columns, row)) for row in cur.fetchall()]
                
                for record in records:
                    for key, value in record.items():
                        if isinstance(value, datetime):
                            record[key] = value.isoformat()
                
                return jsonify(records)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ============ CHW Follow-Up Routes ============
@app.route('/api/chw/assignments', methods=['GET'])
@token_required
@role_required(['chw', 'phc_admin', 'phc_staff'])
def get_chw_assignments():
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                if request.user['role'] == 'chw':
                    cur.execute("""
                        SELECT m.*, ca.priority, ca.assigned_at
                        FROM mothers m
                        JOIN chw_assignments ca ON m.id = ca.mother_id
                        WHERE ca.chw_id = %s
                        ORDER BY 
                            CASE ca.priority 
                                WHEN 'emergency' THEN 1 
                                WHEN 'high_risk' THEN 2 
                                WHEN 'caution' THEN 3 
                                ELSE 4 
                            END
                    """, (request.user['user_id'],))
                else:
                    cur.execute("""
                        SELECT m.*, ca.priority, ca.assigned_at, u.full_name as chw_name
                        FROM mothers m
                        JOIN chw_assignments ca ON m.id = ca.mother_id
                        LEFT JOIN users u ON ca.chw_id = u.id
                        ORDER BY ca.assigned_at DESC
                    """)
                
                columns = [desc[0] for desc in cur.description]
                assignments = [dict(zip(columns, row)) for row in cur.fetchall()]
                
                for assignment in assignments:
                    for key, value in assignment.items():
                        if isinstance(value, datetime):
                            assignment[key] = value.isoformat()
                
                return jsonify(assignments)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/chw/visits', methods=['POST'])
@token_required
@role_required(['chw'])
def create_visit():
    data = request.json
    
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO home_visits (
                        mother_id, chw_id, visit_date, symptoms_observed,
                        mother_condition, danger_signs, vitals, referral_needed,
                        referral_reason, education_provided, notes, next_visit_date, created_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    RETURNING id
                """, (
                    data.get('mother_id'), request.user['user_id'],
                    data.get('visit_date', datetime.utcnow()),
                    json.dumps(data.get('symptoms_observed', [])),
                    data.get('mother_condition'),
                    json.dumps(data.get('danger_signs', [])),
                    json.dumps(data.get('vitals', {})),
                    data.get('referral_needed', False),
                    data.get('referral_reason'),
                    json.dumps(data.get('education_provided', [])),
                    data.get('notes'),
                    data.get('next_visit_date'),
                    datetime.utcnow()
                ))
                visit_id = cur.fetchone()[0]
                conn.commit()
                
                return jsonify({'message': 'Visit recorded successfully', 'id': visit_id}), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/chw/visits/<int:mother_id>', methods=['GET'])
@token_required
def get_visits(mother_id):
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT hv.*, u.full_name as chw_name
                    FROM home_visits hv
                    LEFT JOIN users u ON hv.chw_id = u.id
                    WHERE hv.mother_id = %s
                    ORDER BY hv.visit_date DESC
                """, (mother_id,))
                columns = [desc[0] for desc in cur.description]
                visits = [dict(zip(columns, row)) for row in cur.fetchall()]
                
                for visit in visits:
                    for key, value in visit.items():
                        if isinstance(value, datetime):
                            visit[key] = value.isoformat()
                
                return jsonify(visits)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ============ Emergency Referral Routes ============
@app.route('/api/emergency/alert', methods=['POST'])
@token_required
def create_emergency_alert():
    data = request.json
    
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO emergency_alerts (
                        mother_id, alert_type, description, location_lat, location_lng,
                        location_address, status, created_by, created_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                    RETURNING id
                """, (
                    data.get('mother_id'), data.get('alert_type', 'emergency'),
                    data.get('description'), data.get('location_lat'),
                    data.get('location_lng'), data.get('location_address'),
                    'active', request.user['user_id'], datetime.utcnow()
                ))
                alert_id = cur.fetchone()[0]
                
                # Create notification for PHC and CHW
                cur.execute("""
                    INSERT INTO notifications (type, title, message, mother_id, priority, created_at)
                    VALUES (%s, %s, %s, %s, %s, %s)
                """, (
                    'emergency_alert',
                    'EMERGENCY ALERT',
                    f"Emergency alert raised: {data.get('description', 'Immediate attention required')}",
                    data.get('mother_id'),
                    'critical',
                    datetime.utcnow()
                ))
                
                conn.commit()
                
                return jsonify({'message': 'Emergency alert created', 'id': alert_id}), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/emergency/alerts', methods=['GET'])
@token_required
@role_required(['phc_admin', 'phc_staff', 'chw'])
def get_emergency_alerts():
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT ea.*, m.full_name as mother_name, m.phone as mother_phone,
                           m.address as mother_address
                    FROM emergency_alerts ea
                    LEFT JOIN mothers m ON ea.mother_id = m.id
                    ORDER BY ea.created_at DESC
                """)
                columns = [desc[0] for desc in cur.description]
                alerts = [dict(zip(columns, row)) for row in cur.fetchall()]
                
                for alert in alerts:
                    for key, value in alert.items():
                        if isinstance(value, datetime):
                            alert[key] = value.isoformat()
                
                return jsonify(alerts)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/emergency/alerts/<int:alert_id>', methods=['PUT'])
@token_required
@role_required(['phc_admin', 'phc_staff', 'chw'])
def update_emergency_alert(alert_id):
    data = request.json
    
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    UPDATE emergency_alerts SET
                        status = COALESCE(%s, status),
                        responder_id = COALESCE(%s, responder_id),
                        response_notes = COALESCE(%s, response_notes),
                        resolved_at = %s
                    WHERE id = %s
                """, (
                    data.get('status'),
                    data.get('responder_id', request.user['user_id']),
                    data.get('response_notes'),
                    datetime.utcnow() if data.get('status') == 'resolved' else None,
                    alert_id
                ))
                conn.commit()
                return jsonify({'message': 'Alert updated successfully'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/referral', methods=['POST'])
@token_required
@role_required(['phc_admin', 'phc_staff', 'chw'])
def create_referral():
    data = request.json
    
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO referrals (
                        mother_id, from_facility, to_facility, reason, urgency,
                        clinical_notes, transport_arranged, transport_type,
                        transport_contact, status, referred_by, created_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    RETURNING id
                """, (
                    data.get('mother_id'), data.get('from_facility'),
                    data.get('to_facility'), data.get('reason'),
                    data.get('urgency', 'routine'), data.get('clinical_notes'),
                    data.get('transport_arranged', False), data.get('transport_type'),
                    data.get('transport_contact'), 'pending',
                    request.user['user_id'], datetime.utcnow()
                ))
                referral_id = cur.fetchone()[0]
                conn.commit()
                
                return jsonify({'message': 'Referral created', 'id': referral_id}), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/transport-contacts', methods=['GET'])
@token_required
def get_transport_contacts():
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT * FROM transport_contacts WHERE is_active = TRUE
                    ORDER BY type, name
                """)
                columns = [desc[0] for desc in cur.description]
                contacts = [dict(zip(columns, row)) for row in cur.fetchall()]
                return jsonify(contacts)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ============ Education Hub Routes ============
@app.route('/api/education/modules', methods=['GET'])
def get_education_modules():
    language = request.args.get('language', 'english')
    category = request.args.get('category')
    
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                if category:
                    cur.execute("""
                        SELECT * FROM education_modules 
                        WHERE language = %s AND category = %s
                        ORDER BY order_index
                    """, (language, category))
                else:
                    cur.execute("""
                        SELECT * FROM education_modules 
                        WHERE language = %s
                        ORDER BY category, order_index
                    """, (language,))
                
                columns = [desc[0] for desc in cur.description]
                modules = [dict(zip(columns, row)) for row in cur.fetchall()]
                return jsonify(modules)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/education/categories', methods=['GET'])
def get_education_categories():
    return jsonify([
        {'id': 'anc_importance', 'name': 'ANC Importance', 'icon': 'calendar-check'},
        {'id': 'danger_signs', 'name': 'Danger Signs', 'icon': 'alert-triangle'},
        {'id': 'nutrition', 'name': 'Nutrition', 'icon': 'apple'},
        {'id': 'birth_preparedness', 'name': 'Birth Preparedness', 'icon': 'baby'},
        {'id': 'newborn_care', 'name': 'Newborn Care', 'icon': 'heart'}
    ])

# ============ NataBand Device Routes ============
@app.route('/api/nataband/vitals', methods=['POST'])
@token_required
def record_nataband_vitals():
    data = request.json
    
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO nataband_readings (
                        mother_id, device_id, heart_rate, blood_pressure_systolic,
                        blood_pressure_diastolic, temperature, spo2, activity_level,
                        reading_source, recorded_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    RETURNING id
                """, (
                    data.get('mother_id'), data.get('device_id'),
                    data.get('heart_rate'), data.get('bp_systolic'),
                    data.get('bp_diastolic'), data.get('temperature'),
                    data.get('spo2'), data.get('activity_level'),
                    data.get('source', 'manual'), datetime.utcnow()
                ))
                reading_id = cur.fetchone()[0]
                
                # Check thresholds and create alert if needed
                alerts = check_vital_thresholds(data)
                if alerts:
                    for alert in alerts:
                        cur.execute("""
                            INSERT INTO notifications (type, title, message, mother_id, priority, created_at)
                            VALUES (%s, %s, %s, %s, %s, %s)
                        """, (
                            'vital_alert', alert['title'], alert['message'],
                            data.get('mother_id'), alert['priority'], datetime.utcnow()
                        ))
                
                conn.commit()
                
                return jsonify({
                    'message': 'Vitals recorded',
                    'id': reading_id,
                    'alerts': alerts
                }), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500

def check_vital_thresholds(data):
    alerts = []
    
    bp_systolic = data.get('bp_systolic')
    bp_diastolic = data.get('bp_diastolic')
    
    if bp_systolic:
        if bp_systolic >= 160 or bp_diastolic >= 110:
            alerts.append({
                'title': 'Critical Blood Pressure',
                'message': f'BP reading: {bp_systolic}/{bp_diastolic} mmHg - Immediate attention required',
                'priority': 'critical'
            })
        elif bp_systolic >= 140 or bp_diastolic >= 90:
            alerts.append({
                'title': 'High Blood Pressure',
                'message': f'BP reading: {bp_systolic}/{bp_diastolic} mmHg - Monitor closely',
                'priority': 'high'
            })
    
    heart_rate = data.get('heart_rate')
    if heart_rate:
        if heart_rate > 120 or heart_rate < 50:
            alerts.append({
                'title': 'Abnormal Heart Rate',
                'message': f'Heart rate: {heart_rate} bpm - Requires evaluation',
                'priority': 'high'
            })
    
    spo2 = data.get('spo2')
    if spo2:
        if spo2 < 90:
            alerts.append({
                'title': 'Critical Oxygen Level',
                'message': f'SpO2: {spo2}% - Immediate medical attention required',
                'priority': 'critical'
            })
        elif spo2 < 95:
            alerts.append({
                'title': 'Low Oxygen Level',
                'message': f'SpO2: {spo2}% - Monitor closely',
                'priority': 'high'
            })
    
    temperature = data.get('temperature')
    if temperature:
        if temperature >= 39:
            alerts.append({
                'title': 'High Fever',
                'message': f'Temperature: {temperature}°C - Medical attention required',
                'priority': 'high'
            })
    
    return alerts

@app.route('/api/nataband/readings/<int:mother_id>', methods=['GET'])
@token_required
def get_nataband_readings(mother_id):
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT * FROM nataband_readings
                    WHERE mother_id = %s
                    ORDER BY recorded_at DESC
                    LIMIT 50
                """, (mother_id,))
                columns = [desc[0] for desc in cur.description]
                readings = [dict(zip(columns, row)) for row in cur.fetchall()]
                
                for reading in readings:
                    for key, value in reading.items():
                        if isinstance(value, datetime):
                            reading[key] = value.isoformat()
                
                return jsonify(readings)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ============ Dashboard Routes ============
@app.route('/api/dashboard/stats', methods=['GET'])
@token_required
@role_required(['phc_admin', 'chw', 'phc_staff'])
def get_dashboard_stats():
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                # Total mothers
                cur.execute("SELECT COUNT(*) FROM mothers")
                total_mothers = cur.fetchone()[0]
                
                # Risk level breakdown
                cur.execute("""
                    SELECT risk_level, COUNT(*) 
                    FROM mothers 
                    GROUP BY risk_level
                """)
                risk_breakdown = dict(cur.fetchall())
                
                # Active emergencies
                cur.execute("SELECT COUNT(*) FROM emergency_alerts WHERE status = 'active'")
                active_emergencies = cur.fetchone()[0]
                
                # Missed ANC (next_appointment in the past)
                cur.execute("""
                    SELECT COUNT(*) FROM mothers 
                    WHERE next_appointment < CURRENT_DATE AND next_appointment IS NOT NULL
                """)
                missed_anc = cur.fetchone()[0]
                
                # CHW follow-up progress
                cur.execute("""
                    SELECT 
                        COUNT(DISTINCT ca.mother_id) as assigned,
                        COUNT(DISTINCT CASE WHEN hv.id IS NOT NULL THEN ca.mother_id END) as visited
                    FROM chw_assignments ca
                    LEFT JOIN home_visits hv ON ca.mother_id = hv.mother_id 
                        AND hv.created_at > ca.assigned_at
                """)
                followup = cur.fetchone()
                
                # Referral statuses
                cur.execute("""
                    SELECT status, COUNT(*) 
                    FROM referrals 
                    GROUP BY status
                """)
                referral_stats = dict(cur.fetchall())
                
                # Recent registrations (last 7 days)
                cur.execute("""
                    SELECT DATE(created_at) as date, COUNT(*) 
                    FROM mothers 
                    WHERE created_at > CURRENT_DATE - INTERVAL '7 days'
                    GROUP BY DATE(created_at)
                    ORDER BY date
                """)
                recent_registrations = [{'date': str(row[0]), 'count': row[1]} for row in cur.fetchall()]
                
                return jsonify({
                    'total_mothers': total_mothers,
                    'risk_breakdown': risk_breakdown,
                    'active_emergencies': active_emergencies,
                    'missed_anc': missed_anc,
                    'followup_progress': {
                        'assigned': followup[0] or 0,
                        'visited': followup[1] or 0
                    },
                    'referral_stats': referral_stats,
                    'recent_registrations': recent_registrations
                })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/dashboard/high-risk', methods=['GET'])
@token_required
@role_required(['phc_admin', 'phc_staff', 'chw'])
def get_high_risk_mothers():
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT m.*, 
                           t.risk_score, t.created_at as last_assessment
                    FROM mothers m
                    LEFT JOIN LATERAL (
                        SELECT risk_score, created_at 
                        FROM triage_records 
                        WHERE mother_id = m.id 
                        ORDER BY created_at DESC 
                        LIMIT 1
                    ) t ON true
                    WHERE m.risk_level IN ('high_risk', 'emergency')
                    ORDER BY 
                        CASE m.risk_level 
                            WHEN 'emergency' THEN 1 
                            WHEN 'high_risk' THEN 2 
                        END,
                        t.created_at DESC
                """)
                columns = [desc[0] for desc in cur.description]
                mothers = [dict(zip(columns, row)) for row in cur.fetchall()]
                
                for mother in mothers:
                    for key, value in mother.items():
                        if isinstance(value, datetime):
                            mother[key] = value.isoformat()
                
                return jsonify(mothers)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ============ Notifications Routes ============
@app.route('/api/notifications', methods=['GET'])
@token_required
def get_notifications():
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                role = request.user['role']
                user_id = request.user['user_id']
                
                if role == 'mother':
                    cur.execute("""
                        SELECT n.* FROM notifications n
                        JOIN mothers m ON n.mother_id = m.id
                        JOIN users u ON m.phone = u.phone OR m.user_id = u.id
                        WHERE u.id = %s
                        ORDER BY n.created_at DESC
                        LIMIT 50
                    """, (user_id,))
                elif role == 'chw':
                    cur.execute("""
                        SELECT DISTINCT n.* FROM notifications n
                        LEFT JOIN chw_assignments ca ON n.mother_id = ca.mother_id
                        WHERE ca.chw_id = %s OR n.target_role = 'chw' OR n.target_role IS NULL
                        ORDER BY n.created_at DESC
                        LIMIT 50
                    """, (user_id,))
                else:
                    cur.execute("""
                        SELECT * FROM notifications
                        ORDER BY created_at DESC
                        LIMIT 50
                    """)
                
                columns = [desc[0] for desc in cur.description]
                notifications = [dict(zip(columns, row)) for row in cur.fetchall()]
                
                for notification in notifications:
                    for key, value in notification.items():
                        if isinstance(value, datetime):
                            notification[key] = value.isoformat()
                
                return jsonify(notifications)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/notifications/<int:notification_id>/read', methods=['PUT'])
@token_required
def mark_notification_read(notification_id):
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    UPDATE notifications SET is_read = TRUE, read_at = %s WHERE id = %s
                """, (datetime.utcnow(), notification_id))
                conn.commit()
                return jsonify({'message': 'Notification marked as read'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ============ Sync Routes (for offline-first) ============
@app.route('/api/sync/push', methods=['POST'])
@token_required
def sync_push():
    """Receive offline data and sync to database"""
    data = request.json
    results = {'success': [], 'failed': []}
    
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                for item in data.get('items', []):
                    try:
                        table = item.get('table')
                        action = item.get('action')
                        record = item.get('data')
                        local_id = item.get('local_id')
                        
                        if action == 'create':
                            if table == 'mothers':
                                cur.execute("""
                                    INSERT INTO mothers (
                                        full_name, age, phone, address, lga_community, parity, gravidity,
                                        previous_outcomes, pre_existing_conditions, current_pregnancy_details,
                                        anc_history, next_appointment, registered_by, created_at
                                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                                    RETURNING id
                                """, (
                                    record.get('full_name'), record.get('age'), record.get('phone'),
                                    record.get('address'), record.get('lga_community'), record.get('parity'),
                                    record.get('gravidity'), record.get('previous_outcomes'),
                                    record.get('pre_existing_conditions'), record.get('current_pregnancy_details'),
                                    record.get('anc_history'), record.get('next_appointment'),
                                    request.user['user_id'], datetime.utcnow()
                                ))
                                server_id = cur.fetchone()[0]
                                results['success'].append({'local_id': local_id, 'server_id': server_id})
                            
                            elif table == 'home_visits':
                                cur.execute("""
                                    INSERT INTO home_visits (
                                        mother_id, chw_id, visit_date, symptoms_observed,
                                        mother_condition, danger_signs, vitals, referral_needed,
                                        notes, next_visit_date, created_at
                                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                                    RETURNING id
                                """, (
                                    record.get('mother_id'), request.user['user_id'],
                                    record.get('visit_date'), json.dumps(record.get('symptoms_observed', [])),
                                    record.get('mother_condition'), json.dumps(record.get('danger_signs', [])),
                                    json.dumps(record.get('vitals', {})), record.get('referral_needed', False),
                                    record.get('notes'), record.get('next_visit_date'), datetime.utcnow()
                                ))
                                server_id = cur.fetchone()[0]
                                results['success'].append({'local_id': local_id, 'server_id': server_id})
                    
                    except Exception as e:
                        results['failed'].append({'local_id': local_id, 'error': str(e)})
                
                conn.commit()
        
        return jsonify(results)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/sync/pull', methods=['GET'])
@token_required
def sync_pull():
    """Get data for offline sync"""
    last_sync = request.args.get('last_sync')
    
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                data = {}
                
                # Get mothers
                if last_sync:
                    cur.execute("""
                        SELECT * FROM mothers WHERE updated_at > %s OR created_at > %s
                    """, (last_sync, last_sync))
                else:
                    cur.execute("SELECT * FROM mothers")
                
                columns = [desc[0] for desc in cur.description]
                data['mothers'] = [dict(zip(columns, row)) for row in cur.fetchall()]
                
                # Get education modules for offline
                cur.execute("SELECT * FROM education_modules")
                columns = [desc[0] for desc in cur.description]
                data['education_modules'] = [dict(zip(columns, row)) for row in cur.fetchall()]
                
                # Get transport contacts
                cur.execute("SELECT * FROM transport_contacts WHERE is_active = TRUE")
                columns = [desc[0] for desc in cur.description]
                data['transport_contacts'] = [dict(zip(columns, row)) for row in cur.fetchall()]
                
                # Convert datetime objects
                for key in data:
                    for item in data[key]:
                        for k, v in item.items():
                            if isinstance(v, datetime):
                                item[k] = v.isoformat()
                
                return jsonify({
                    'data': data,
                    'sync_time': datetime.utcnow().isoformat()
                })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
