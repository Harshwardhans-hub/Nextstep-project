from flask import Flask, request, jsonify
from flask_cors import CORS
from firebase_admin import auth as fb_auth, credentials, initialize_app
from config import Config
from models import db, User, StudentProfile, AptitudeTest, TestResult, Recommendation, PortfolioItem, LearningGoal, CareerBookmark
from ml.engine import Engine
import json
import os
from sqlalchemy import inspect, text

engine = Engine()

firebase_initialized = False

def create_app():
    global firebase_initialized
    app = Flask(__name__)
    app.config.from_object(Config)

    CORS(app, resources={r"/*": {"origins": app.config['CORS_ORIGINS'].split(',')}})

    db.init_app(app)

    # Simple per-IP rate limiter in production (120 req/min)
    rate_store = {}

    @app.before_request
    def _rate_limit():
        if os.environ.get('ENV', 'development') != 'production':
            return None
        try:
            from time import time
            ip = request.remote_addr or 'unknown'
            now = int(time())
            window = 60
            limit = 120
            bucket = rate_store.get(ip, [])
            bucket = [t for t in bucket if now - t < window]
            if len(bucket) >= limit:
                return jsonify({"error": "rate_limited", "retry_after": window}), 429
            bucket.append(now)
            rate_store[ip] = bucket
        except Exception:
            return None

    # --- Helpers -----------------------------------------------------------
    def compute_best_stream_from_breakdown(br: dict) -> str:
        """Compute best-fit stream exactly once and reuse across endpoints.
        Mirrors the dashboard logic, including the 'science' proxy.
        Returns one of: 'engineering', 'biology', 'humanities', 'commerce'.
        """
        try:
            maths = float(br.get('maths', br.get('mathematics', br.get('Maths', 50.0))))
            physics = float(br.get('physics', br.get('Physics', maths)))
            chemistry = float(br.get('chemistry', br.get('Chemistry', maths)))
            biology = float(br.get('biology', br.get('Biology', 50.0)))
            english = float(br.get('english', br.get('English', 50.0)))
            economics = float(br.get('economics', br.get('Economics', 50.0)))
            accounts = float(br.get('accountancy', br.get('accounts', 50.0)))
            history = float(br.get('history', br.get('History', 50.0)))
            science = float(br.get('science', br.get('Science', 50.0)))
            social = float(br.get('social', br.get('Social', 50.0)))
            # Use science as proxy for Physics & Chemistry when specific are absent
            if physics == maths and chemistry == maths and science != 50.0:
                physics = chemistry = science
            pcm = (physics + chemistry + maths)/3.0
            pcb = (physics + chemistry + biology)/3.0
            # Include social in humanities calculation
            hum = (history + english + economics + social)/4.0
            com = (accounts + economics + maths)/3.0
            stream_scores = {
                'engineering': pcm,
                'biology': pcb,
                'humanities': hum,
                'commerce': com,
            }
            return max(stream_scores, key=stream_scores.get)
        except Exception:
            return 'engineering'

    # Ensure critical schema parts exist (dev convenience)
    with app.app_context():
        inspector = inspect(db.engine)
        if inspector.has_table('users'):
            cols = [c['name'] for c in inspector.get_columns('users')]
            # Ensure 'uid' exists and is NOT NULL UNIQUE
            if 'uid' not in cols:
                db.session.execute(text("ALTER TABLE users ADD COLUMN uid VARCHAR(128) NULL AFTER id"))
                db.session.execute(text("UPDATE users SET uid = email WHERE uid IS NULL AND email IS NOT NULL"))
                db.session.execute(text("ALTER TABLE users MODIFY COLUMN uid VARCHAR(128) NOT NULL"))
                db.session.execute(text("ALTER TABLE users ADD UNIQUE (uid)"))
                db.session.commit()

        # Ensure at least one aptitude test exists for foreign key references
        try:
            if AptitudeTest.query.count() == 0:
                db.session.add(AptitudeTest(name='General Aptitude'))
                db.session.commit()
        except Exception:
            pass

        # Ensure learning_goals table exists
        if not inspector.has_table('learning_goals'):
            db.session.execute(text(
                """
                CREATE TABLE learning_goals (
                    id INT PRIMARY KEY AUTO_INCREMENT,
                    user_id INT NOT NULL,
                    skill VARCHAR(120) NOT NULL,
                    task VARCHAR(255) NOT NULL,
                    week INT DEFAULT 1,
                    done BOOLEAN DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    CONSTRAINT fk_lg_user FOREIGN KEY (user_id) REFERENCES users(id)
                )
                """
            ))
            db.session.commit()
            # Handle legacy 'firebase_uid' column that is NOT NULL
            if 'firebase_uid' in cols:
                # Backfill firebase_uid from uid (preferred) or email
                db.session.execute(text("UPDATE users SET firebase_uid = COALESCE(uid, email) WHERE (firebase_uid IS NULL OR firebase_uid = '')"))
                # Relax NOT NULL to allow inserts that don't set this legacy column
                try:
                    db.session.execute(text("ALTER TABLE users MODIFY COLUMN firebase_uid VARCHAR(128) NULL"))
                except Exception:
                    pass
                db.session.commit()

        # Ensure portfolio_items has expected columns
        if inspector.has_table('portfolio_items'):
            pcols = [c['name'] for c in inspector.get_columns('portfolio_items')]
            if 'name' not in pcols:
                db.session.execute(text("ALTER TABLE portfolio_items ADD COLUMN name VARCHAR(200) NULL AFTER user_id"))
            if 'url' not in pcols:
                db.session.execute(text("ALTER TABLE portfolio_items ADD COLUMN url TEXT NULL"))
            if 'created_at' not in pcols:
                db.session.execute(text("ALTER TABLE portfolio_items ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP"))
            if 'description' not in pcols:
                db.session.execute(text("ALTER TABLE portfolio_items ADD COLUMN description VARCHAR(255) NULL"))
            if 'tags' not in pcols:
                db.session.execute(text("ALTER TABLE portfolio_items ADD COLUMN tags VARCHAR(255) NULL"))
            db.session.commit()

        # Ensure career_bookmarks table exists
        if not inspector.has_table('career_bookmarks'):
            db.session.execute(text(
                """
                CREATE TABLE career_bookmarks (
                    id INT PRIMARY KEY AUTO_INCREMENT,
                    user_id INT NOT NULL,
                    title VARCHAR(200) NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    CONSTRAINT fk_cb_user FOREIGN KEY (user_id) REFERENCES users(id)
                )
                """
            ))
            db.session.commit()

    if not firebase_initialized:
        cred_path = app.config['FIREBASE_CREDENTIALS_PATH']
        if os.path.exists(cred_path):
            cred = credentials.Certificate(cred_path)
            initialize_app(cred)
            firebase_initialized = True

    @app.get("/health")
    def health():
        return {"status": "ok"}

    # Auth middleware (verify Firebase token)
    def current_user():
        token = request.headers.get('Authorization', '').replace('Bearer ', '')
        # Development fallback if Firebase is not initialized OR ENV != production
        if (not firebase_initialized) or (os.environ.get('ENV', 'development') != 'production'):
            demo_uid = request.headers.get('X-Demo-UID', 'demo-user')
            demo_email = request.headers.get('X-Demo-Email', 'demo@example.com')
            role = 'admin' if request.headers.get('X-Admin') == 'true' else 'student'
            user = User.query.filter_by(uid=demo_uid).first()
            if not user:
                user = User(uid=demo_uid, email=demo_email, role=role)
                db.session.add(user)
                db.session.commit()
            else:
                user.role = role
                db.session.commit()
            return user
        if not token:
            return None
        try:
            decoded = fb_auth.verify_id_token(token)
            uid = decoded['uid']
            email = decoded.get('email', '')
            user = User.query.filter_by(uid=uid).first()
            if not user:
                user = User(uid=uid, email=email, role='student')
                db.session.add(user)
                db.session.commit()
            return user
        except Exception:
            return None

    @app.post('/api/register')
    def register_profile():
        user = current_user()
        if not user:
            return jsonify({"error": "unauthorized"}), 401
        data = request.json or {}
        profile = StudentProfile.query.filter_by(user_id=user.id).first()
        if not profile:
            profile = StudentProfile(user_id=user.id)
        profile.first_name = data.get('first_name')
        profile.last_name = data.get('last_name')
        profile.student_class = data.get('student_class')
        profile.parent_phone = data.get('parent_phone')
        db.session.add(profile)
        db.session.commit()
        return {"message": "profile saved"}

    @app.get('/api/profile')
    def get_profile():
        user = current_user()
        if not user:
            return jsonify({"error": "unauthorized"}), 401
        p = StudentProfile.query.filter_by(user_id=user.id).first()
        return {
            "email": user.email,
            "role": user.role,
            "student_class": p.student_class if p else None,
            "first_name": p.first_name if p else None,
            "last_name": p.last_name if p else None,
            "parent_phone": p.parent_phone if p else None,
        }

    # Career bookmarks
    @app.get('/api/bookmarks')
    def bookmarks_list():
        user = current_user()
        if not user:
            return jsonify({"error": "unauthorized"}), 401
        items = CareerBookmark.query.filter_by(user_id=user.id).order_by(CareerBookmark.id.desc()).all()
        return [{"id": b.id, "title": b.title, "created_at": b.created_at.isoformat()} for b in items]

    @app.post('/api/bookmarks')
    def bookmarks_add():
        user = current_user()
        if not user:
            return jsonify({"error": "unauthorized"}), 401
        data = request.json or {}
        title = data.get('title')
        if not title:
            return jsonify({"error": "title required"}), 400
        b = CareerBookmark(user_id=user.id, title=title)
        db.session.add(b)
        db.session.commit()
        return {"id": b.id}

    @app.delete('/api/bookmarks/<int:bid>')
    def bookmarks_delete(bid):
        user = current_user()
        if not user:
            return jsonify({"error": "unauthorized"}), 401
        b = CareerBookmark.query.get(bid)
        if not b or b.user_id != user.id:
            return jsonify({"error": "not found"}), 404
        db.session.delete(b)
        db.session.commit()
        return {"message": "deleted"}

    # Reports
    @app.get('/api/reports')
    def reports():
        user = current_user()
        if not user:
            return jsonify({"error": "unauthorized"}), 401
        # score history
        results = TestResult.query.filter_by(user_id=user.id).order_by(TestResult.created_at.asc()).all()
        history = [{"t": r.created_at.isoformat(), "score": r.score} for r in results]
        # portfolio growth by day
        counts = db.session.execute(text(
            """
            SELECT DATE(created_at) d, COUNT(*) c
            FROM portfolio_items WHERE user_id = :uid
            GROUP BY DATE(created_at) ORDER BY DATE(created_at)
            """
        ), {"uid": user.id}).mappings().all()
        growth = [{"t": str(row['d']), "count": int(row['c'])} for row in counts]
        return {"scores": history, "portfolio": growth}

    # Admin endpoint to clear all user data for fresh system
    @app.post('/api/admin/clear-all-data')
    def clear_all_data():
        user = current_user()
        if not user:
            return jsonify({"error": "unauthorized"}), 401
        try:
            # Clear all user data tables
            TestResult.query.delete()
            Recommendation.query.delete()
            PortfolioItem.query.delete()
            LearningGoal.query.delete()
            CareerBookmark.query.delete()
            StudentProfile.query.delete()
            User.query.delete()
            db.session.commit()
            return {"message": "All user data cleared"}
        except Exception as e:
            db.session.rollback()
            return jsonify({"error": str(e)}), 500

    @app.get('/api/dashboard')
    def dashboard():
        user = current_user()
        if not user:
            return jsonify({"error": "unauthorized"}), 401
        # Portfolio: count + naive progress (10% per item up to 100)
        pcount = PortfolioItem.query.filter_by(user_id=user.id).count()
        pprogress = min(100, pcount * 10)

        # Latest aptitude test result
        prof = StudentProfile.query.filter_by(user_id=user.id).first()
        student_class = str(getattr(prof, 'student_class', '10') or '10')
        latest = TestResult.query.filter_by(user_id=user.id).order_by(TestResult.id.desc()).first()
        if not latest:
            return {
                "requires_test": True,
                "portfolio": {"count": pcount, "progress": min(100, pcount * 10)},
                "aptitude": None,
                "careers": [],
                "skills": {},
                "student_class": student_class,
            }
        overall = 0
        logical = 0
        creative = 0
        try:
            br = json.loads(latest.breakdown) if isinstance(latest.breakdown, str) else latest.breakdown
        except Exception:
            br = {}
        overall = int(round(latest.score)) if latest.score is not None else 0
        logical = int(round(br.get('logical', 0)))
        creative = int(round(br.get('creative', 0)))
        # If subject-based breakdown provided, derive logical/creative proxies
        if (logical == 0 and creative == 0) and isinstance(br, dict) and br:
            try:
                m = float(br.get('maths', br.get('mathematics', 0)))
                p = float(br.get('physics', br.get('Physics', 0)))
                c = float(br.get('chemistry', br.get('Chemistry', 0)))
                eng = float(br.get('english', br.get('English', 0)))
                soc = float(br.get('social', br.get('Social', 0)))
                bio = float(br.get('biology', br.get('Biology', 0)))
                # Logical ~ PCM average (or math+science when PCM not present)
                lp = [x for x in [m, p, c] if x > 0]
                if not lp:
                    sci = float(br.get('science', br.get('Science', 0)))
                    lp = [v for v in [m, sci] if v > 0]
                logical = int(round(sum(lp)/len(lp))) if lp else 0
                # Creative ~ language/social average
                cp = [x for x in [eng, soc] if x > 0]
                if not cp and bio > 0:
                    cp = [eng, bio]
                creative = int(round(sum(cp)/len(cp))) if cp else 0
            except Exception:
                pass

        # Recommendations created at submission time
        recs = Recommendation.query.filter_by(user_id=user.id).order_by(Recommendation.id.desc()).limit(4).all()
        recs_payload = [{"title": r.title, "suitability": r.suitability} for r in recs]
        # If engine didn't persist any, compute top roles from latest breakdown to avoid fixed placeholders
        if not recs_payload:
            # Subject proxies from breakdown (defaults mid if missing)
            maths = float(br.get('maths', br.get('mathematics', br.get('Maths', 50.0))))
            physics = float(br.get('physics', br.get('Physics', maths)))
            chemistry = float(br.get('chemistry', br.get('Chemistry', maths)))
            biology = float(br.get('biology', br.get('Biology', 50.0)))
            english = float(br.get('english', br.get('English', 50.0)))
            economics = float(br.get('economics', br.get('Economics', 50.0)))
            accounts = float(br.get('accountancy', br.get('accounts', 50.0)))
            history = float(br.get('history', br.get('History', 50.0)))
            pcm = (physics + chemistry + maths)/3.0
            pcb = (physics + chemistry + biology)/3.0
            hum = (history + english + economics)/3.0
            com = (accounts + economics + maths)/3.0
            role_pool = [
                ("Software Engineer", 'engineering', 0.6*pcm + 0.2*english),
                ("Data Scientist", 'engineering', 0.55*pcm + 0.15*english),
                ("Doctor (MBBS)", 'biology', 0.6*pcb + 0.1*english),
                ("Biotechnologist", 'biology', 0.5*pcb + 0.1*english),
                ("Journalist", 'humanities', 0.6*hum),
                ("Historian", 'humanities', 0.55*hum),
                ("Chartered Accountant", 'commerce', 0.6*com),
                ("Investment Analyst", 'commerce', 0.65*com),
            ]
            scored = sorted(({"title": t, "suitability": int(round(min(100.0, s))) , "domain": d} for (t,d,s) in role_pool), key=lambda x: x['suitability'], reverse=True)
            recs_payload = [{"title": x['title'], "suitability": x['suitability']} for x in scored[:4]]

        # Stream-aware skill gaps derived from aptitude and subjects
        # Use the shared helper to compute best stream
        best_stream = compute_best_stream_from_breakdown(br)
        # Extract individual subjects for skill gap calculations
        maths = float(br.get('maths', br.get('mathematics', 50.0)))
        physics = float(br.get('physics', 50.0))
        chemistry = float(br.get('chemistry', 50.0))
        biology = float(br.get('biology', 50.0))
        english = float(br.get('english', 50.0))
        economics = float(br.get('economics', 50.0))
        accounts = float(br.get('accountancy', br.get('accounts', 50.0)))
        history = float(br.get('history', 50.0))
        social = float(br.get('social', br.get('Social', 50.0)))
        # Recompute aggregates used in fit formulas below
        pcm = (physics + chemistry + maths) / 3.0
        pcb = (physics + chemistry + biology) / 3.0
        # Fit proxies per stream
        if best_stream == 'engineering':
            fit_prog = int(round((0.7*pcm + 0.3*logical)))
            fit_da = int(round((0.6*pcm + 0.4*logical)))
            fit_ps = int(round((0.5*logical + 0.3*english + 0.2*creative)))
            skills = {
                "Programming": max(0, 100 - fit_prog),
                "Data Analysis": max(0, 100 - fit_da),
                "Problem Solving": max(0, 100 - fit_ps),
            }
        elif best_stream == 'biology':
            fit_lab = int(round((0.7*pcb + 0.3*logical)))
            fit_chem = int(round(chemistry))
            fit_comm = int(round((0.6*english + 0.4*creative)))
            skills = {
                "Biology Lab": max(0, 100 - fit_lab),
                "Chemistry Basics": max(0, 100 - fit_chem),
                "Scientific Communication": max(0, 100 - fit_comm),
            }
        elif best_stream == 'humanities':
            fit_w = int(round((0.7*english + 0.3*creative)))
            fit_r = int(round((0.5*history + 0.3*social + 0.2*economics)))
            fit_ct = int(round((0.5*logical + 0.5*creative)))
            skills = {
                "Writing": max(0, 100 - fit_w),
                "Research": max(0, 100 - fit_r),
                "Critical Thinking": max(0, 100 - fit_ct),
            }
        else:  # commerce
            fit_acc = int(round((0.7*accounts + 0.3*maths)))
            fit_ba = int(round((0.6*economics + 0.4*logical)))
            fit_quant = int(round((0.7*maths + 0.3*logical)))
            skills = {
                "Accounting": max(0, 100 - fit_acc),
                "Business Analysis": max(0, 100 - fit_ba),
                "Quantitative Aptitude": max(0, 100 - fit_quant),
            }

        # Stream guidance for class 9-10 students to choose 11-12 stream
        guidance = None
        if student_class in ['9','10']:
            reasons = []
            if best_stream == 'engineering':
                reasons.append('Strong PCM (Physics, Chemistry, Maths) fundamentals observed')
                suggested = ['Physics','Chemistry','Mathematics']
            elif best_stream == 'biology':
                reasons.append('Higher Biology and Science aptitude indicated')
                suggested = ['Biology','Chemistry','Physics']
            elif best_stream == 'humanities':
                reasons.append('Strength in languages and social sciences')
                suggested = ['History','Economics','English']
            else:
                reasons.append('Commerce-oriented aptitude with numbers and business')
                suggested = ['Accountancy','Economics','Mathematics']
            guidance = {
                'recommended_stream': best_stream,
                'why': reasons,
                'suggested_subjects_in_11_12': suggested,
                'next_steps': [
                    'Discuss stream choice with parents/teachers',
                    'Explore the detailed careers for this stream in Explore Careers',
                    'Start foundational courses and projects for the suggested subjects'
                ]
            }

        return {
            "portfolio": {"count": pcount, "progress": pprogress},
            "aptitude": {"overall": overall, "logical": logical, "creative": creative},
            "careers": recs_payload,
            "skills": skills,
            "student_class": student_class,
            "stream_guidance": guidance,
        }

    @app.post('/api/aptitude/submit')
    def submit_aptitude():
        user = current_user()
        if not user:
            return jsonify({"error": "unauthorized"}), 401
        data = request.json or {}
        # Accept either raw answers or a provided breakdown/score
        if 'breakdown' in data:
            breakdown = data.get('breakdown') or {}
            try:
                score = int(round(float(data.get('score', 0))))
            except Exception:
                score = 0
        else:
            score, breakdown = engine.analyze(data.get('answers', {}))
        # record test result
        # Use the first available aptitude test (created at startup if none existed)
        t = AptitudeTest.query.order_by(AptitudeTest.id.asc()).first()
        if not t:
            t = AptitudeTest(name='General Aptitude')
            db.session.add(t)
            db.session.commit()
        tr = TestResult(user_id=user.id, test_id=t.id, score=score, breakdown=json.dumps(breakdown))
        db.session.add(tr)
        # refresh recommendations (clear old to keep dashboard clean)
        Recommendation.query.filter_by(user_id=user.id).delete()
        # generate fresh recommendations based on subject breakdown
        maths = float(breakdown.get('maths', breakdown.get('mathematics', breakdown.get('Maths', 50.0))))
        physics = float(breakdown.get('physics', breakdown.get('Physics', maths)))
        chemistry = float(breakdown.get('chemistry', breakdown.get('Chemistry', maths)))
        biology = float(breakdown.get('biology', breakdown.get('Biology', 50.0)))
        english = float(breakdown.get('english', breakdown.get('English', 50.0)))
        economics = float(breakdown.get('economics', breakdown.get('Economics', 50.0)))
        accounts = float(breakdown.get('accountancy', breakdown.get('accounts', 50.0)))
        history = float(breakdown.get('history', breakdown.get('History', 50.0)))
        science = float(breakdown.get('science', breakdown.get('Science', 50.0)))
        social = float(breakdown.get('social', breakdown.get('Social', 50.0)))
        # Use science as proxy for PCB when individual subjects not present
        if physics == maths and chemistry == maths and science != 50.0:
            physics = chemistry = science
        pcm = (physics + chemistry + maths)/3.0
        pcb = (physics + chemistry + biology)/3.0
        hum = (history + english + economics)/3.0
        com = (accounts + economics + maths)/3.0
        role_pool = [
            ("Software Engineer", 'engineering', 0.6*pcm + 0.2*english),
            ("Data Scientist", 'engineering', 0.55*pcm + 0.15*english),
            ("Mechanical Engineer", 'engineering', 0.65*pcm),
            ("Doctor (MBBS)", 'biology', 0.6*pcb + 0.1*english),
            ("Biotechnologist", 'biology', 0.5*pcb + 0.1*english),
            ("Pharmacist", 'biology', 0.55*pcb),
            ("Journalist", 'humanities', 0.6*hum),
            ("Historian", 'humanities', 0.55*hum),
            ("Psychologist", 'humanities', 0.5*hum + 0.2*english),
            ("Chartered Accountant", 'commerce', 0.6*com),
            ("Investment Analyst", 'commerce', 0.65*com),
            ("Business Analyst", 'commerce', 0.5*com + 0.2*maths),
        ]
        scored = sorted(({"title": t, "suitability": int(round(min(100.0, s))), "domain": d} for (t,d,s) in role_pool), key=lambda x: x['suitability'], reverse=True)
        # Store top 6 as recommendations
        for item in scored[:6]:
            db.session.add(Recommendation(
                user_id=user.id,
                title=item['title'],
                suitability=item['suitability'],
                details=item['domain'],
                is_active=True
            ))
        db.session.commit()
        return {"score": score, "breakdown": breakdown}

    @app.get('/api/skill-gap')
    def skill_gap():
        user = current_user()
        if not user:
            return jsonify({"error": "unauthorized"}), 401
        # Dynamically derive target by class and "have" from latest aptitude
        # Baseline from engine
        sg = engine.skill_gap()
        latest = TestResult.query.filter_by(user_id=user.id).order_by(TestResult.id.desc()).first()
        if not latest:
            return {"requires_test": True}
        logical = 50.0
        creative = 50.0
        if latest:
            try:
                br = json.loads(latest.breakdown) if isinstance(latest.breakdown, str) else latest.breakdown
            except Exception:
                br = {}
            logical = float(br.get('logical', br.get('Logical', 50.0)))
            creative = float(br.get('creative', br.get('Creative', 50.0)))
        prof = StudentProfile.query.filter_by(user_id=user.id).first()
        student_class = str(getattr(prof, 'student_class', '10') or '10')
        # Extract subjects from breakdown for stream-aware skills
        maths = float(br.get('maths', br.get('mathematics', br.get('Maths', 50.0))))
        physics = float(br.get('physics', br.get('Physics', maths)))
        chemistry = float(br.get('chemistry', br.get('Chemistry', maths)))
        biology = float(br.get('biology', br.get('Biology', 50.0)))
        english = float(br.get('english', br.get('English', 50.0)))
        economics = float(br.get('economics', br.get('Economics', 50.0)))
        accounts = float(br.get('accountancy', br.get('accounts', 50.0)))
        history = float(br.get('history', br.get('History', 50.0)))
        social = float(br.get('social', br.get('Social', 50.0)))
        science = float(br.get('science', br.get('Science', 50.0)))
        # Align with dashboard: if only 'science' is present, use it as proxy for Physics & Chemistry
        if physics == maths and chemistry == maths and science != 50.0:
            physics = chemistry = science

        # Infer stream strengths using the shared helper (keeps parity with dashboard)
        best_stream = compute_best_stream_from_breakdown(br)

        # Label uses stream; do not override stream with recommendation to avoid mismatches
        top_rec = Recommendation.query.filter_by(user_id=user.id).order_by(Recommendation.suitability.desc()).first()
        target_label = f"Required for {best_stream.title()}"

        # Build stream-specific skills and current estimates (0-10)
        if best_stream == 'engineering':
            skills = ['Programming', 'Data Analysis', 'Problem Solving', 'Physics Fundamentals', 'Communication']
            est = {
                'Programming': (0.5*maths + 0.3*logical + 0.2*creative)/10.0,
                'Data Analysis': (0.45*maths + 0.2*physics + 0.15*logical + 0.2*english)/10.0,
                'Problem Solving': (0.5*logical + 0.2*maths + 0.3*creative)/10.0,
                'Physics Fundamentals': (0.7*physics + 0.3*maths)/10.0,
                'Communication': (0.5*creative + 0.2*english + 0.1*logical)/10.0,
            }
            target_base = {'Programming': 8.5, 'Data Analysis': 8.0, 'Problem Solving': 8.0, 'Physics Fundamentals': 7.5, 'Communication': 7.0}
        elif best_stream == 'biology':
            skills = ['Biology Lab', 'Chemistry Basics', 'Scientific Reasoning', 'Data Recording', 'Communication']
            est = {
                'Biology Lab': (0.7*biology + 0.2*chemistry + 0.1*english)/10.0,
                'Chemistry Basics': (0.6*chemistry + 0.2*physics + 0.2*maths)/10.0,
                'Scientific Reasoning': (0.45*logical + 0.25*biology + 0.15*chemistry + 0.15*english)/10.0,
                'Data Recording': (0.4*maths + 0.3*biology + 0.2*english + 0.1*logical)/10.0,
                'Communication': (0.5*english + 0.3*creative + 0.2*logical)/10.0,
            }
            target_base = {'Biology Lab': 8.5, 'Chemistry Basics': 8.0, 'Scientific Reasoning': 8.0, 'Data Recording': 7.5, 'Communication': 7.0}
        elif best_stream == 'humanities':
            skills = ['Writing', 'Research', 'Critical Thinking', 'Economics Basics', 'Communication']
            est = {
                'Writing': (0.6*english + 0.3*creative + 0.1*logical)/10.0,
                'Research': (0.35*history + 0.25*social + 0.2*english + 0.15*economics + 0.05*logical)/10.0,
                'Critical Thinking': (0.5*logical + 0.2*english + 0.15*history + 0.15*social)/10.0,
                'Economics Basics': (0.6*economics + 0.2*maths + 0.2*english)/10.0,
                'Communication': (0.5*english + 0.2*creative + 0.15*social + 0.15*logical)/10.0,
            }
            target_base = {'Writing': 8.5, 'Research': 8.0, 'Critical Thinking': 8.0, 'Economics Basics': 7.5, 'Communication': 7.5}
        else:  # commerce
            skills = ['Accounting', 'Business Analysis', 'Quantitative Aptitude', 'Excel/Spreadsheets', 'Communication']
            est = {
                'Accounting': (0.6*accounts + 0.3*maths + 0.1*english)/10.0,
                'Business Analysis': (0.5*economics + 0.2*english + 0.3*logical)/10.0,
                'Quantitative Aptitude': (0.7*maths + 0.3*logical)/10.0,
                'Excel/Spreadsheets': (0.5*maths + 0.2*economics + 0.3*logical)/10.0,
                'Communication': (0.5*english + 0.2*creative + 0.3*logical)/10.0,
            }
            target_base = {'Accounting': 8.5, 'Business Analysis': 8.0, 'Quantitative Aptitude': 8.0, 'Excel/Spreadsheets': 7.5, 'Communication': 7.0}

        # Targets scale by class (higher for 11-12)
        class_bonus = 1.5 if student_class in ['11','12'] else (1.2 if student_class in ['10'] else 1.0)
        have = {k: max(0.0, min(10.0, v)) for k, v in est.items()}
        target = {k: min(10.0, max(target_base.get(k, 7.0), have[k] + (1.5 if have[k] < 7 else 1.0))* (1.0 if student_class in ['9','10'] else 1.0)) for k in have}
        # Lightly boost targets by class bonus
        target = {k: min(10.0, (v + 0.0) * (1.0 + (class_bonus-1.0)*0.5)) for k, v in target.items()}
        gaps = []
        for s in skills:
            u = float(have[s])
            t = float(target[s])
            diff = max(0.0, t - u)
            gap_pct = int(round(min(100.0, (diff/10.0)*100.0)))
            gaps.append({"skill": s, "gap": gap_pct, "have": u, "need": t})
        # Curated resources map (stream-aware)
        resource_bank = {
            "Python": [
                {"name": "Python for Everybody (Coursera)", "url": "https://www.coursera.org/specializations/python"},
                {"name": "Automate the Boring Stuff", "url": "https://automatetheboringstuff.com/"},
                {"name": "Real Python – Beginner", "url": "https://realpython.com/"},
            ],
            "SQL": [
                {"name": "Mode SQL Tutorial", "url": "https://mode.com/sql-tutorial/"},
                {"name": "SQLBolt", "url": "https://sqlbolt.com/"},
                {"name": "Khan Academy SQL", "url": "https://www.khanacademy.org/computing/computer-programming/sql"},
            ],
            "Statistics": [
                {"name": "OpenIntro Statistics", "url": "https://www.openintro.org/book/os/"},
                {"name": "StatQuest (YouTube)", "url": "https://www.youtube.com/@statquest"},
                {"name": "Khan Academy – Stats", "url": "https://www.khanacademy.org/math/statistics-probability"},
            ],
            "Machine Learning": [
                {"name": "Andrew Ng ML", "url": "https://www.coursera.org/learn/machine-learning"},
                {"name": "Hands-On ML (Aurelien)", "url": "https://github.com/ageron/handson-ml3"},
                {"name": "fast.ai Practical Deep Learning", "url": "https://course.fast.ai/"},
            ],
            "Communication": [
                {"name": "Public Speaking – Toastmasters", "url": "https://www.toastmasters.org/find-a-club"},
                {"name": "Effective Communication (Coursera)", "url": "https://www.coursera.org/learn/wharton-communication-skills"},
                {"name": "Writing Tips (Grammarly Blog)", "url": "https://www.grammarly.com/blog/"},
            ],
            # Engineering
            "Programming": [
                {"name": "freeCodeCamp – JavaScript Algorithms", "url": "https://www.freecodecamp.org/learn/javascript-algorithms-and-data-structures/"},
                {"name": "Harvard CS50 (edX)", "url": "https://cs50.harvard.edu/x/"},
            ],
            "Data Analysis": [
                {"name": "Kaggle – Intro to Data Analysis", "url": "https://www.kaggle.com/learn/intro-to-programming"},
                {"name": "Pandas Basics", "url": "https://pandas.pydata.org/docs/user_guide/10min.html"},
            ],
            "Problem Solving": [
                {"name": "HackerRank – Algorithms", "url": "https://www.hackerrank.com/domains/algorithms"},
                {"name": "Project Euler", "url": "https://projecteuler.net/"},
            ],
            "Physics Fundamentals": [
                {"name": "Khan Academy – Physics", "url": "https://www.khanacademy.org/science/physics"},
            ],
            # Biology
            "Biology Lab": [
                {"name": "Lab Techniques Basics (YouTube)", "url": "https://www.youtube.com/results?search_query=basic+biology+lab+techniques"},
                {"name": "Cell Biology (Khan Academy)", "url": "https://www.khanacademy.org/science/biology"},
            ],
            "Chemistry Basics": [
                {"name": "General Chemistry (Khan Academy)", "url": "https://www.khanacademy.org/science/chemistry"},
            ],
            "Scientific Reasoning": [
                {"name": "Scientific Method Crash Course", "url": "https://www.youtube.com/watch?v=SMGRe824kak"},
            ],
            "Data Recording": [
                {"name": "Excel for Beginners", "url": "https://edu.gcfglobal.org/en/excel/"},
            ],
            # Humanities
            "Writing": [
                {"name": "Academic Writing (Purdue OWL)", "url": "https://owl.purdue.edu/owl/general_writing/academic_writing/index.html"},
            ],
            "Research": [
                {"name": "How to Research (UNC Writing Center)", "url": "https://writingcenter.unc.edu/tips-and-tools/research-process/"},
            ],
            "Critical Thinking": [
                {"name": "Critical Thinking – edX", "url": "https://www.edx.org/learn/critical-thinking"},
            ],
            "Economics Basics": [
                {"name": "Principles of Economics (Khan Academy)", "url": "https://www.khanacademy.org/economics-finance-domain/microeconomics"},
            ],
            # Commerce
            "Accounting": [
                {"name": "Accounting Basics (AccountingCoach)", "url": "https://www.accountingcoach.com/"},
            ],
            "Business Analysis": [
                {"name": "BA Fundamentals (Coursera)", "url": "https://www.coursera.org/specializations/business-analytics"},
            ],
            "Quantitative Aptitude": [
                {"name": "Quantitative Aptitude (Indiabix)", "url": "https://www.indiabix.com/aptitude/questions-and-answers/"},
            ],
            "Excel/Spreadsheets": [
                {"name": "Excel Basics (Microsoft Learn)", "url": "https://learn.microsoft.com/training/excel/"},
            ],
        }
        # Recommend top resources for top 3 gaps
        gaps_sorted = sorted(gaps, key=lambda x: x['gap'], reverse=True)
        recommendations = []
        for g in gaps_sorted[:3]:
            recs = resource_bank.get(g['skill'], [])
            recommendations.append({"skill": g['skill'], "resources": recs})
        return {
            "skills": skills,
            "user": [have[s] for s in skills],
            "target": [target[s] for s in skills],
            "gaps": gaps,
            "recommendations": recommendations,
            "target_label": target_label,
        }

    # Removed planner endpoints as requested
        return jsonify({"message": "Planner functionality has been removed"})

    @app.delete('/api/goals/<int:gid>')
    def goal_delete(gid):
        user = current_user()
        if not user:
            return jsonify({"error": "unauthorized"}), 401
        g = LearningGoal.query.get(gid)
        if not g or g.user_id != user.id:
            return jsonify({"error": "not found"}), 404
        db.session.delete(g)
        db.session.commit()
        return {"message": "deleted"}

    @app.get('/api/admin/students')
    def admin_students():
        user = current_user()
        if not user or user.role != 'admin':
            return jsonify({"error": "forbidden"}), 403
        profiles = StudentProfile.query.all()
        out = []
        for p in profiles:
            u = User.query.get(p.user_id)
            out.append({
                "id": p.id,
                "name": f"{p.first_name} {p.last_name}",
                "email": u.email,
                "class": p.student_class,
                "status": "Pending",
            })
        return out

    # Portfolio metadata endpoints (client uploads files to Supabase Storage)
    @app.get('/api/portfolio')
    def portfolio_list():
        user = current_user()
        if not user:
            return jsonify({"error": "unauthorized"}), 401
        items = PortfolioItem.query.filter_by(user_id=user.id).order_by(PortfolioItem.created_at.desc()).all()
        return [
            {"id": i.id, "name": i.name, "url": i.url, "description": getattr(i, 'description', None), "tags": getattr(i, 'tags', None), "created_at": i.created_at.isoformat()} for i in items
        ]

    @app.post('/api/portfolio')
    def portfolio_add():
        user = current_user()
        if not user:
            return jsonify({"error": "unauthorized"}), 401
        data = request.json or {}
        name = data.get('name')
        url = data.get('url')
        description = data.get('description')
        tags = data.get('tags')
        if not name or not url:
            return jsonify({"error": "name and url required"}), 400
        item = PortfolioItem(user_id=user.id, name=name, url=url)
        if description:
            setattr(item, 'description', description)
        if tags:
            setattr(item, 'tags', tags)
        db.session.add(item)
        db.session.commit()
        return {"id": item.id, "name": item.name, "url": item.url, "description": getattr(item, 'description', None), "tags": getattr(item, 'tags', None), "created_at": item.created_at.isoformat()}

    @app.patch('/api/portfolio/<int:pid>')
    def portfolio_update(pid):
        user = current_user()
        if not user:
            return jsonify({"error": "unauthorized"}), 401
        item = PortfolioItem.query.get(pid)
        if not item or item.user_id != user.id:
            return jsonify({"error": "not found"}), 404
        data = request.json or {}
        for key in ['name','description','tags','url']:
            if key in data:
                setattr(item, key, data[key])
        db.session.commit()
        return {"message": "updated"}

    @app.delete('/api/portfolio/<int:pid>')
    def portfolio_delete(pid):
        user = current_user()
        if not user:
            return jsonify({"error": "unauthorized"}), 401
        item = PortfolioItem.query.get(pid)
        if not item or item.user_id != user.id:
            return jsonify({"error": "not found"}), 404
        db.session.delete(item)
        db.session.commit()
        return {"message": "deleted"}

    @app.get('/api/careers')
    def careers():
        user = current_user()
        if not user:
            return jsonify({"error": "unauthorized"}), 401
        # Build a class/stream-aware career set weighted by latest subject breakdown and recommendations
        prof = StudentProfile.query.filter_by(user_id=user.id).first()
        student_class = str(getattr(prof, 'student_class', '10') or '10')
        latest = TestResult.query.filter_by(user_id=user.id).order_by(TestResult.id.desc()).first()
        if not latest:
            return {"requires_test": True}
        try:
            br = json.loads(latest.breakdown) if isinstance(latest.breakdown, str) else latest.breakdown
        except Exception:
            br = {}
        # Subject scores if available
        maths = float(br.get('maths', br.get('mathematics', br.get('Maths', 50.0))))
        science = float(br.get('science', br.get('Science', 50.0)))
        social = float(br.get('social', br.get('Social', 50.0)))
        english = float(br.get('english', br.get('English', 50.0)))
        physics = float(br.get('physics', br.get('Physics', science)))
        chemistry = float(br.get('chemistry', br.get('Chemistry', science)))
        biology = float(br.get('biology', br.get('Biology', science)))
        history = float(br.get('history', br.get('History', social)))
        economics = float(br.get('economics', br.get('Economics', social)))
        accounts = float(br.get('accountancy', br.get('accounts', 50.0)))
        business = float(br.get('business', br.get('Business', 50.0)))
        recs = Recommendation.query.filter_by(user_id=user.id).all()
        boost = {r.title: min(25.0, (r.suitability or 0)/5.0) for r in recs}
        # Catalogs per broad stream
        eng_roles = [
            ("Software Engineer", 0.5, 0.3, 0.2, 14.0, "engineering"),
            ("Data Scientist", 0.4, 0.4, 0.2, 18.5, "engineering"),
            ("Mechanical Engineer", 0.6, 0.25, 0.15, 12.0, "engineering"),
            ("Electrical Engineer", 0.55, 0.3, 0.15, 12.8, "engineering"),
            ("Civil Engineer", 0.5, 0.3, 0.2, 11.5, "engineering"),
        ]
        bio_roles = [
            ("Doctor (MBBS)", 0.1, 0.45, 0.45, 25.0, "biology"),
            ("Biotechnologist", 0.25, 0.35, 0.4, 14.5, "biology"),
            ("Pharmacist", 0.2, 0.5, 0.3, 12.0, "biology"),
            ("Microbiologist", 0.15, 0.35, 0.5, 11.0, "biology"),
        ]
        hum_roles = [
            ("Historian", 0.0, 0.4, 0.6, 9.0, "humanities"),
            ("Journalist", 0.1, 0.3, 0.6, 10.5, "humanities"),
            ("Psychologist", 0.1, 0.4, 0.5, 11.0, "humanities"),
            ("Sociologist", 0.05, 0.35, 0.6, 9.5, "humanities"),
        ]
        com_roles = [
            ("Chartered Accountant", 0.5, 0.4, 0.1, 15.0, "commerce"),
            ("Investment Analyst", 0.45, 0.4, 0.15, 18.0, "commerce"),
            ("Business Analyst", 0.4, 0.3, 0.3, 12.0, "commerce"),
            ("Economist", 0.3, 0.2, 0.5, 13.0, "commerce"),
        ]
        # Steps/resources per stream
        steps_by_stream = {
            "engineering": ["Master PCM fundamentals", "Build projects (coding/robotics)", "Prepare for JEE/entrance", "Apply for internships"],
            "biology": ["Strengthen PCB fundamentals", "Lab work and projects", "Prepare for NEET/entrance", "Shadow professionals"],
            "humanities": ["Deepen core subjects", "Develop writing/research", "Contribute to school publications", "Apply to internships"],
            "commerce": ["Learn accounting & finance", "Practice case studies", "Certifications (e.g., Excel)", "Internships at firms"],
        }
        resources_by_stream = {
            "engineering": [{"name":"NPTEL PCM","url":"https://nptel.ac.in/"}],
            "biology": [{"name":"Khan Academy Biology","url":"https://www.khanacademy.org/science/biology"}],
            "humanities": [{"name":"The Economist – Espresso","url":"https://www.economist.com/espresso"}],
            "commerce": [{"name":"AccountingCoach","url":"https://www.accountingcoach.com/"}],
        }
        # Select stream by best-fit or class default
        # For 11-12, infer stream by best of (PCM -> eng), (PCB -> bio), (humanities -> hist+eng), (commerce -> accounts+economics)
        pcm = (physics + chemistry + maths)/3.0
        pcb = (physics + chemistry + biology)/3.0
        hum = (history + english + economics)/3.0
        com = (accounts + business + economics)/3.0
        stream_scores = {
            'engineering': pcm,
            'biology': pcb,
            'humanities': hum,
            'commerce': com,
        }
        best_stream = max(stream_scores, key=stream_scores.get)
        role_pool = eng_roles + bio_roles + hum_roles + com_roles
        out = []
        for title, w_pcm, w_econ, w_hum, salary, domain in role_pool:
            fit = 0.0
            if domain == 'engineering':
                fit = w_pcm*pcm + 0.2*english
            elif domain == 'biology':
                fit = w_pcm*pcb + 0.1*english
            elif domain == 'humanities':
                fit = w_hum*hum + 0.15*english
            elif domain == 'commerce':
                fit = 0.5*com + 0.3*economics + 0.2*maths
            fit += boost.get(title, 0.0)
            item = {
                "title": title,
                "suitability": int(round(min(100.0, fit))),
                "median_salary": salary,
                "steps": steps_by_stream[domain],
                "resources": resources_by_stream[domain],
                "domain": domain,
            }
            out.append(item)
        # Bias show-casing by best stream and class maturity
        out.sort(key=lambda x: (x['domain']==best_stream, x['suitability']), reverse=True)
        return {"careers": out[:12]}

    # Career trends (salaries, demand index, emerging fields)
    @app.get('/api/trends')
    def trends():
        user = current_user()
        if not user:
            return jsonify({"error": "unauthorized"}), 401
        # Weight roles based on latest subject breakdown and existing recommendations
        latest = TestResult.query.filter_by(user_id=user.id).order_by(TestResult.id.desc()).first()
        if not latest:
            return {"requires_test": True}
        try:
            br = json.loads(latest.breakdown) if isinstance(latest.breakdown, str) else latest.breakdown
        except Exception:
            br = {}
        maths = float(br.get('maths', 50))
        physics = float(br.get('physics', 50))
        chemistry = float(br.get('chemistry', 50))
        biology = float(br.get('biology', 50))
        english = float(br.get('english', 50))
        economics = float(br.get('economics', 50))
        accounts = float(br.get('accountancy', br.get('accounts', 50)))
        history = float(br.get('history', 50))
        recs = Recommendation.query.filter_by(user_id=user.id).all()
        rec_boost = {r.title: min(15, (r.suitability or 0)/10.0) for r in recs}
        roles_catalog = [
            ("Software Engineer", (physics+maths)/2.0, 14.0),
            ("Data Scientist", (maths+physics+chemistry)/3.0, 18.5),
            ("Doctor (MBBS)", (biology+chemistry)/2.0, 25.0),
            ("Biotechnologist", (biology+chemistry+physics)/3.0, 14.5),
            ("Journalist", (english+history)/2.0, 10.5),
            ("Economist", (economics+maths)/2.0, 13.0),
            ("Chartered Accountant", (accounts+economics)/2.0, 15.0),
        ]
        roles = []
        for title, base_score, salary in roles_catalog:
            demand = int(round(min(100, base_score + 20 + rec_boost.get(title, 0))))
            roles.append({"title": title, "demand": demand, "median_salary": salary})
        roles.sort(key=lambda r: r['demand'], reverse=True)
        return {
            "updated": "today",
            "roles": roles[:20],
            "emerging": ["AI Safety", "Prompt Engineering", "Biotech QA", "Sustainable Finance"],
        }

    @app.get('/api/questions')
    def questions():
        user = current_user()
        if not user:
            return jsonify({"error": "unauthorized"}), 401
        grade = request.args.get('class', '10')
        stream = request.args.get('stream')  # for 11-12: engineering, biology, humanities, commerce
        try:
            n = int(request.args.get('n', '50'))
        except Exception:
            n = 50
        import random

        def mcq(qid, text, subject, options, answer):
            return {"id": qid, "text": text, "domain": subject, "options": options, "answer": answer}

        bank = []
        qid = 1
        rng = random.Random(str(grade) + ':' + str(stream or ''))

        if grade in ['9','10']:
            subjects = ['maths','science','social','english']
            samples = {
                'maths': [
                    ("What is the value of 3x when x=7?", ["10","14","21","28"], 2),
                    ("The HCF of 24 and 36 is", ["6","12","18","24"], 1),
                    ("Solve: 2x + 5 = 15", ["x = 5","x = 10","x = 7.5","x = 20"], 0),
                    ("What is 25% of 80?", ["20","15","25","30"], 0),
                    ("Simplify: (x + 3)(x + 4)", ["x² + 7x + 12","x² + 7x + 7","x² + 12","x² + 7"], 0),
                    ("If a² + b² = 100 and ab = 48, what is (a + b)?", ["12","14","10","16"], 1),
                    ("The area of a circle with radius 7 cm is (π = 22/7)", ["154 cm²","144 cm²","176 cm²","196 cm²"], 0),
                    ("Square root of 625 is", ["20","25","30","35"], 1),
                    ("What is 15% of 200?", ["25","30","35","40"], 1),
                    ("Factorize: x² - 9", ["(x - 3)(x + 3)","(x - 3)²","(x + 3)²","(x - 9)(x + 1)"], 0),
                    ("If 3x = 12, then x equals", ["3","4","5","6"], 1),
                    ("The LCM of 12 and 18 is", ["36","54","72","90"], 0),
                    ("The sum of interior angles of a triangle is", ["90°","180°","270°","360°"], 1),
                    ("Which is a prime number?", ["15","17","21","25"], 1),
                    ("The value of (2³) × (2²) is", ["32","64","128","256"], 0),
                ],
                'science': [
                    ("Which gas is essential for photosynthesis?", ["CO2","O2","N2","H2"], 0),
                    ("Force is measured in", ["Joule","Newton","Pascal","Watt"], 1),
                    ("What is the SI unit of force?", ["Newton","Joule","Watt","Pascal"], 0),
                    ("What is the chemical formula of water?", ["H2O","CO2","O2","H2O2"], 0),
                    ("Which organelle is known as the powerhouse of the cell?", ["Mitochondria","Nucleus","Ribosome","Chloroplast"], 0),
                    ("The process by which plants make food is called", ["Respiration","Photosynthesis","Transpiration","Digestion"], 1),
                    ("What is the speed of light?", ["3 × 10⁸ m/s","3 × 10⁶ m/s","3 × 10⁵ m/s","3 × 10⁷ m/s"], 0),
                    ("Which planet is known as the Red Planet?", ["Venus","Mars","Jupiter","Saturn"], 1),
                    ("The pH value of pure water is", ["5","7","9","11"], 1),
                    ("Which gas is most abundant in Earth's atmosphere?", ["Oxygen","Nitrogen","Carbon dioxide","Hydrogen"], 1),
                    ("The smallest unit of life is", ["Atom","Cell","Tissue","Organ"], 1),
                    ("What type of energy does a moving car possess?", ["Potential","Kinetic","Chemical","Nuclear"], 1),
                    ("The boiling point of water is", ["90°C","95°C","100°C","105°C"], 2),
                    ("Which vitamin is produced by the skin in sunlight?", ["Vitamin A","Vitamin B","Vitamin C","Vitamin D"], 3),
                    ("The process of conversion of solid to gas is called", ["Melting","Evaporation","Sublimation","Condensation"], 2),
                ],
                'social': [
                    ("The Indus Valley Civilization is known for", ["Vedas","Urban planning","Gunpowder","Pyramids"], 1),
                    ("Panchayati Raj relates to", ["Rural governance","National defense","Foreign policy","Banking"], 0),
                    ("Who was the first Prime Minister of India?", ["Jawaharlal Nehru","Mahatma Gandhi","Sardar Patel","Dr. Rajendra Prasad"], 0),
                    ("What is GDP?", ["Gross Domestic Product","General Domestic Product","Gross Development Product","Global Domestic Product"], 0),
                    ("When did India gain independence?", ["1947","1950","1945","1942"], 0),
                    ("The capital of India is", ["Mumbai","Delhi","Kolkata","Chennai"], 1),
                    ("Who wrote the Indian National Anthem?", ["Rabindranath Tagore","Bankim Chandra","Sarojini Naidu","Subhash Chandra Bose"], 0),
                    ("The longest river in India is", ["Yamuna","Ganga","Brahmaputra","Godavari"], 1),
                    ("Which movement was started by Mahatma Gandhi in 1942?", ["Non-Cooperation","Civil Disobedience","Quit India","Khilafat"], 2),
                    ("The Battle of Plassey was fought in", ["1757","1764","1857","1947"], 0),
                    ("The first Indian to go to space was", ["Rakesh Sharma","Kalpana Chawla","Sunita Williams","APJ Abdul Kalam"], 0),
                    ("Which is the largest state in India by area?", ["Maharashtra","Rajasthan","Madhya Pradesh","Uttar Pradesh"], 1),
                    ("The Indian Constitution was adopted on", ["15 Aug 1947","26 Jan 1950","26 Nov 1949","2 Oct 1950"], 2),
                    ("Which ocean lies to the south of India?", ["Atlantic","Pacific","Indian","Arctic"], 2),
                    ("Who is known as the Iron Man of India?", ["Nehru","Patel","Gandhi","Bose"], 1),
                ],
                'english': [
                    ("Choose the correct synonym of 'Rapid'", ["Slow","Quick","Dull","Calm"], 1),
                    ("Identify the adjective: 'She wore a beautiful dress'", ["She","wore","beautiful","dress"], 2),
                    ("Choose the correct antonym for 'Abundant'", ["Plenty","Scarce","Sufficient","Excess"], 1),
                    ("Correct passive: 'She writes a letter'", ["A letter is written by her","A letter was written by her","A letter is being written","She is writing a letter"], 0),
                    ("Figure of speech: 'The stars danced in the sky'", ["Simile","Metaphor","Personification","Alliteration"], 2),
                    ("Choose the correct form: 'He ___ to school every day'", ["go","goes","going","gone"], 1),
                    ("Which word is a noun?", ["Run","Quickly","Happiness","Beautiful"], 2),
                    ("The plural of 'child' is", ["Childs","Childes","Children","Childer"], 2),
                    ("Identify the verb: 'They play cricket'", ["They","play","cricket","None"], 1),
                    ("A sentence that asks a question is called", ["Declarative","Interrogative","Imperative","Exclamatory"], 1),
                    ("Choose the correct spelling", ["Recieve","Receive","Recive","Receeve"], 1),
                    ("The past tense of 'go' is", ["Goed","Gone","Went","Going"], 2),
                    ("An antonym of 'ancient' is", ["Old","Modern","Historical","Traditional"], 1),
                    ("Which punctuation mark ends a statement?", ["Question mark","Period","Exclamation","Comma"], 1),
                    ("'The cat sat on the mat' - what is 'on'?", ["Noun","Verb","Preposition","Adjective"], 2),
                ],
            }
            for s in subjects:
                for text_q, opts, ans in samples[s]:
                    bank.append(mcq(qid, text_q, s, opts, ans)); qid += 1
        else:
            stream = (stream or 'engineering').lower()
            if stream not in ['engineering','biology','humanities','commerce']:
                stream = 'engineering'
            stream_subjects = {
                'engineering': ['physics','chemistry','maths','english'],
                'biology': ['biology','chemistry','physics','english'],
                'humanities': ['history','economics','english','social'],
                'commerce': ['accountancy','business','economics','maths'],
            }
            subjects = stream_subjects[stream]
            samples = {
                'physics': [
                    ("Unit of electric current is", ["Volt","Ampere","Ohm","Tesla"], 1),
                    ("What is the unit of magnetic flux?", ["Weber","Tesla","Henry","Gauss"], 0),
                    ("Escape velocity from Earth is", ["11.2 km/s","7.9 km/s","15.0 km/s","9.8 km/s"], 0),
                    ("Newton's second law relates force to", ["Mass","Acceleration","Mass × Acceleration","Velocity"], 2),
                    ("The SI unit of work is", ["Newton","Joule","Watt","Pascal"], 1),
                    ("Ohm's law states V =", ["I/R","IR","R/I","I + R"], 1),
                    ("The frequency of AC supply in India is", ["50 Hz","60 Hz","100 Hz","120 Hz"], 0),
                    ("An object in motion continues in motion due to", ["Inertia","Force","Acceleration","Momentum"], 0),
                    ("The universal gravitational constant G is approximately", ["6.67 × 10⁻¹¹","9.8","3 × 10⁸","1.6 × 10⁻¹⁹"], 0),
                    ("Which lens is used to correct myopia?", ["Convex","Concave","Bifocal","Cylindrical"], 1),
                    ("The unit of electric charge is", ["Ampere","Coulomb","Volt","Ohm"], 1),
                    ("Kinetic energy formula is", ["mv","½mv²","mv²","m²v"], 1),
                    ("The refractive index of glass is approximately", ["1.0","1.5","2.0","2.5"], 1),
                    ("What does LED stand for?", ["Light Emitting Diode","Low Energy Device","Large Electronic Display","None"], 0),
                    ("The phenomenon of light bending is called", ["Reflection","Refraction","Diffraction","Polarization"], 1),
                ],
                'chemistry': [
                    ("Atomic number represents", ["Neutrons","Electrons","Protons","Mass number"], 2),
                    ("pH of pure water is", ["7","0","14","10"], 0),
                    ("Common salt formula is", ["NaCl","H2O","CO2","O2"], 0),
                    ("The noble gas with atomic number 10 is", ["Helium","Neon","Argon","Krypton"], 1),
                    ("Avogadro's number is approximately", ["6.02 × 10²³","3 × 10⁸","9.8","1.6 × 10⁻¹⁹"], 0),
                    ("The process of rusting is an example of", ["Reduction","Oxidation","Neutralization","Sublimation"], 1),
                    ("Which element has the symbol Fe?", ["Fluorine","Iron","Francium","Fermium"], 1),
                    ("The pH scale ranges from", ["0 to 7","0 to 14","1 to 10","1 to 14"], 1),
                    ("An acid turns blue litmus paper", ["Blue","Red","Green","Yellow"], 1),
                    ("The molecular formula of glucose is", ["C₆H₁₂O₆","C₁₂H₂₂O₁₁","CH₄","H₂O"], 0),
                    ("Which gas is released during photosynthesis?", ["CO₂","O₂","N₂","H₂"], 1),
                    ("The periodic table was created by", ["Dalton","Mendeleev","Bohr","Rutherford"], 1),
                    ("Diamond and graphite are allotropes of", ["Oxygen","Carbon","Silicon","Phosphorus"], 1),
                    ("The bond between two hydrogen atoms is", ["Ionic","Covalent","Metallic","Hydrogen"], 1),
                    ("Catalyst changes the", ["Product","Reactant","Rate of reaction","Equilibrium"], 2),
                ],
                'maths': [
                    ("Derivative of x^2 is", ["2x","x","x^2","1"], 0),
                    ("What is sin 45°?", ["1/√2","√3/2","1/2","1"], 0),
                    ("∫ 1/x dx =", ["ln|x| + C","x + C","1/x^2 + C","x^2 + C"], 0),
                    ("The value of cos 60° is", ["½","1","√3/2","1/√2"], 0),
                    ("Determinant of a 2×2 identity matrix is", ["0","1","2","-1"], 1),
                    ("The slope of line 2x + 3y = 6 is", ["-2/3","2/3","3/2","-3/2"], 0),
                    ("If f(x) = 3x + 2, then f(5) is", ["15","17","13","19"], 1),
                    ("The sum of first n natural numbers is", ["n(n+1)","n(n+1)/2","n²","(n+1)/2"], 1),
                    ("A quadratic equation has at most how many real roots?", ["1","2","3","4"], 1),
                    ("tan 90° is", ["0","1","Undefined","∞"], 2),
                    ("The distance formula is", ["√[(x₂-x₁)² + (y₂-y₁)²]","(x₂-x₁) + (y₂-y₁)","x₂+y₂","None"], 0),
                    ("If log₁₀(100) = x, then x is", ["1","2","10","100"], 1),
                    ("The graph of y = x² is a", ["Line","Circle","Parabola","Hyperbola"], 2),
                    ("The area under a curve is found by", ["Differentiation","Integration","Substitution","Addition"], 1),
                    ("Factorial of 5 (5!) is", ["20","60","120","150"], 2),
                ],
                'english': [
                    ("Choose antonym of 'Transparent'", ["Clear","Opaque","Lucid","Sheer"], 1),
                    ("A synonym for 'Benevolent' is", ["Kind","Cruel","Neutral","Angry"], 0),
                    ("Identify the tense: 'She has been working'", ["Simple present","Present continuous","Present perfect continuous","Past perfect"], 2),
                    ("'To break the ice' means", ["To start conversation","To freeze water","To be cold","To stop talking"], 0),
                    ("Shakespeare wrote", ["War and Peace","Hamlet","1984","Great Expectations"], 1),
                    ("The plural of 'criterion' is", ["Criterions","Criteria","Criterias","Criteries"], 1),
                    ("An autobiography is written by", ["Someone else","The subject themselves","A historian","A journalist"], 1),
                    ("The opposite of 'expand' is", ["Contract","Increase","Grow","Inflate"], 0),
                    ("Which is a collective noun?", ["Dog","Team","Run","Happy"], 1),
                    ("'As brave as a lion' is an example of", ["Metaphor","Simile","Personification","Hyperbole"], 1),
                    ("The correct spelling is", ["Occassion","Occasion","Ocasion","Occation"], 1),
                    ("An oxymoron is", ["Same meaning words","Opposite meaning words together","Exaggeration","Sound repetition"], 1),
                    ("The prefix 'un-' means", ["Not","Very","Again","Before"], 0),
                    ("'The wind howled' is an example of", ["Simile","Personification","Alliteration","Onomatopoeia"], 1),
                    ("A haiku is a form of", ["Novel","Drama","Poetry","Essay"], 2),
                ],
                'biology': [
                    ("Site of photosynthesis is", ["Ribosome","Chloroplast","Mitochondria","Nucleus"], 1),
                    ("Which blood group is universal donor?", ["O negative","AB positive","A positive","B positive"], 0),
                    ("DNA stands for", ["Deoxyribonucleic acid","Dinitrogen acid","Double nitrogen acid","Deoxyribonitric acid"], 0),
                    ("The human heart has how many chambers?", ["2","3","4","5"], 2),
                    ("Insulin is produced by", ["Liver","Pancreas","Kidney","Heart"], 1),
                    ("The basic unit of nervous system is", ["Neuron","Nephron","Axon","Dendrite"], 0),
                    ("Mendel is known as the father of", ["Biology","Genetics","Botany","Zoology"], 1),
                    ("The process of cell division is called", ["Osmosis","Mitosis","Photosynthesis","Respiration"], 1),
                    ("Which organ filters blood?", ["Heart","Liver","Kidney","Lung"], 2),
                    ("The molecule that carries genetic information is", ["RNA","DNA","Protein","Lipid"], 1),
                    ("Hemoglobin is found in", ["White blood cells","Red blood cells","Platelets","Plasma"], 1),
                    ("Plants take in CO₂ through", ["Roots","Stem","Stomata","Flowers"], 2),
                    ("The study of birds is called", ["Ornithology","Entomology","Herpetology","Ichthyology"], 0),
                    ("Humans belong to the class", ["Reptilia","Aves","Mammalia","Amphibia"], 2),
                    ("The smallest bone in human body is in the", ["Hand","Foot","Ear","Nose"], 2),
                ],
                'history': [
                    ("Father of Indian Constitution", ["Gandhi","Nehru","Ambedkar","Patel"], 2),
                    ("The Quit India Movement was launched in", ["1942","1947","1930","1920"], 0),
                    ("The First World War started in", ["1914","1918","1939","1945"], 0),
                    ("Who founded the Maurya Empire?", ["Ashoka","Chandragupta Maurya","Bindusara","Samudragupta"], 1),
                    ("The French Revolution began in", ["1789","1776","1804","1815"], 0),
                    ("The Battle of Waterloo was fought in", ["1805","1815","1825","1835"], 1),
                    ("Who was the first Mughal emperor?", ["Akbar","Humayun","Babur","Aurangzeb"], 2),
                    ("The Russian Revolution occurred in", ["1905","1917","1920","1930"], 1),
                    ("The Treaty of Versailles ended which war?", ["World War I","World War II","Cold War","Vietnam War"], 0),
                    ("The ancient civilization of Mesopotamia was in modern-day", ["Egypt","Iraq","India","China"], 1),
                    ("Martin Luther King Jr. fought for", ["Women's rights","Civil rights","Labor rights","Animal rights"], 1),
                    ("The Berlin Wall fell in", ["1985","1989","1991","1995"], 1),
                    ("Who discovered America?", ["Magellan","Columbus","Vasco da Gama","Marco Polo"], 1),
                    ("The Renaissance began in", ["France","England","Italy","Spain"], 2),
                    ("The Industrial Revolution started in", ["France","Germany","Britain","USA"], 2),
                ],
                'economics': [
                    ("Demand law states", ["Price↓ ⇒ Demand↓","Price↑ ⇒ Demand↑","Price↑ ⇒ Demand↓","No relation"], 2),
                    ("GDP stands for", ["Gross Domestic Product","General Domestic Product","Gross Development Product","Global Domestic Product"], 0),
                    ("A market with a single seller is called", ["Monopoly","Oligopoly","Perfect competition","Duopoly"], 0),
                    ("Inflation means", ["Rise in prices","Fall in prices","Stable prices","Zero prices"], 0),
                    ("The central bank of India is", ["SBI","RBI","ICICI","HDFC"], 1),
                    ("Supply curve generally slopes", ["Upward","Downward","Horizontal","Vertical"], 0),
                    ("Opportunity cost is", ["Monetary cost","Next best alternative","Total cost","Fixed cost"], 1),
                    ("Fiscal policy deals with", ["Money supply","Government spending and tax","Interest rates","Exchange rates"], 1),
                    ("Elasticity of demand measures", ["Quantity change","Price change","Responsiveness to price change","Income"], 2),
                    ("An indirect tax is", ["Income tax","GST","Corporate tax","Wealth tax"], 1),
                    ("In perfect competition, firms are", ["Price makers","Price takers","Price fixers","Price leaders"], 1),
                    ("The WTO stands for", ["World Trade Organization","World Tax Organization","World Transfer Organization","None"], 0),
                    ("Recession means", ["Economic growth","Economic decline","Stable economy","High inflation"], 1),
                    ("Budget deficit occurs when", ["Revenue > Expenditure","Revenue < Expenditure","Revenue = Expenditure","None"], 1),
                    ("Human capital refers to", ["Money","Skills and knowledge","Machines","Buildings"], 1),
                ],
                'accountancy': [
                    ("Assets =", ["Liabilities","Capital","Liabilities + Capital","Income"], 2),
                    ("Double entry system means", ["One entry","Two entries per transaction","Three entries","Multiple entries"], 1),
                    ("Debit is on which side?", ["Left","Right","Top","Bottom"], 0),
                    ("Depreciation is charged on", ["Current assets","Fixed assets","Liabilities","Capital"], 1),
                    ("Which is a current asset?", ["Machinery","Building","Cash","Goodwill"], 2),
                    ("The trial balance checks", ["Profit","Loss","Arithmetical accuracy","Cash balance"], 2),
                    ("Revenue expenditure is", ["Capital nature","Recurring nature","One-time","None"], 1),
                    ("Goodwill is", ["Tangible asset","Intangible asset","Liability","Expense"], 1),
                    ("Closing stock appears in", ["Trading account","Profit & loss","Balance sheet","Both A and C"], 3),
                    ("A journal is also called", ["Ledger","Book of original entry","Trial balance","Cash book"], 1),
                    ("Accrual basis recognizes", ["Cash transactions","Credit transactions","When earned/incurred","When cash moves"], 2),
                    ("Provision for bad debts is", ["Asset","Liability","Expense","Revenue"], 2),
                    ("Retained earnings are", ["Distributed","Kept in business","Given to creditors","Paid as tax"], 1),
                    ("The accounting equation is", ["A = L + E","A + L = E","A = L - E","A - L = E"], 0),
                    ("Going concern concept assumes", ["Business will close","Business will continue","Business sold","None"], 1),
                ],
                'business': [
                    ("Marketing mix includes", ["4Ps","5Ps","6Ps","7Ps"], 0),
                    ("The 4Ps are Product, Price, Place and", ["People","Promotion","Packaging","Process"], 1),
                    ("SWOT analysis includes Strengths, Weaknesses, Opportunities and", ["Threats","Tactics","Trends","Targets"], 0),
                    ("A business plan is", ["Financial statement","Blueprint for business","Marketing tool","Legal document"], 1),
                    ("Sole proprietorship is owned by", ["One person","Two persons","Many persons","Government"], 0),
                    ("A stakeholder is", ["Owner","Interested party","Employee","Customer"], 1),
                    ("CSR stands for", ["Corporate Social Responsibility","Corporate Sales Report","Company Security Rules","None"], 0),
                    ("Break-even point is where", ["Profit = Loss","Revenue = Cost","Sales = Production","None"], 1),
                    ("E-commerce means", ["Electronic commerce","Easy commerce","European commerce","None"], 0),
                    ("Branding helps in", ["Cost reduction","Differentiation","Production","None"], 1),
                    ("A franchise is", ["Full ownership","License to use brand","Partnership","Sole proprietorship"], 1),
                    ("Market segmentation divides market by", ["Geography","Demography","Behavior","All of these"], 3),
                    ("IPO stands for", ["Initial Public Offering","Internal Private Offering","International Public Offering","None"], 0),
                    ("Working capital is", ["Fixed assets","Current assets - Current liabilities","Total assets","Capital + Reserves"], 1),
                    ("Blue ocean strategy focuses on", ["Competition","Creating new demand","Cost cutting","Market share"], 1),
                ],
                'social': [
                    ("GDP measures", ["Total income","Population","Exports","Inflation"], 0),
                    ("Democracy means", ["Rule by one","Rule by few","Rule by people","Rule by military"], 2),
                    ("The UN headquarters is in", ["Geneva","Paris","New York","London"], 2),
                    ("Human rights are", ["Universal","Regional","National","Local"], 0),
                    ("Sustainable development focuses on", ["Present needs","Future needs","Both present and future","None"], 2),
                    ("Globalization means", ["Isolation","Integration of economies","Local trade","None"], 1),
                    ("Gender equality means", ["Men superior","Women superior","Equal rights","None"], 2),
                    ("The Right to Education is a", ["Fundamental right","Legal right","Directive principle","None"], 0),
                    ("Climate change is caused primarily by", ["Deforestation","Greenhouse gases","Pollution","All of these"], 3),
                    ("Poverty line measures", ["Minimum income","Maximum income","Average income","None"], 0),
                    ("Urbanization means", ["Moving to cities","Moving to villages","No movement","Migration"], 0),
                    ("A federal system has", ["One government","Two levels of government","Three levels","No government"], 1),
                    ("The judiciary is", ["Legislative","Executive","Judicial","None"], 2),
                    ("Secularism means", ["One religion","No religion","All religions equal","None"], 2),
                    ("Public goods are", ["Rival and excludable","Non-rival and non-excludable","Rival only","Excludable only"], 1),
                ],
            }
            for s in subjects:
                for text_q, opts, ans in samples[s]:
                    bank.append(mcq(qid, text_q, s, opts, ans)); qid += 1
        rng.shuffle(bank)
        return {"class": grade, "questions": bank}

    # Career simulations: simple scenario-based tasks
    @app.get('/api/simulations')
    def simulations():
        user = current_user()
        if not user:
            return jsonify({"error": "unauthorized"}), 401
        scenarios = [
            {
                "id": "ux_wireframe",
                "title": "Design a login screen wireframe",
                "career": "UX Designer",
                "questions": [
                    {"id": "a", "text": "Best first step?", "options": ["Pick a font","Sketch user flow","Choose colors","Write code"], "answer": 1},
                    {"id": "b", "text": "Essential element?", "options": ["Logo","Forgot Password","Ads","Auto-video"], "answer": 1},
                ]
            },
            {
                "id": "pm_prioritize",
                "title": "Prioritize product backlog",
                "career": "Product Manager",
                "questions": [
                    {"id": "a", "text": "Prioritization framework?", "options": ["RICE","RGB","CRUD","DNS"], "answer": 0},
                    {"id": "b", "text": "Valuable first?", "options": ["Low impact/High effort","High impact/Low effort","Low/Low","High/High"], "answer": 1},
                ]
            },
            {
                "id": "ds_choose_model",
                "title": "Choose a model for classification",
                "career": "Data Scientist",
                "questions": [
                    {"id": "a", "text": "Imbalanced classes technique?", "options": ["SMOTE","RGB","CDN","CORS"], "answer": 0},
                    {"id": "b", "text": "Baseline model?", "options": ["Random Forest","Neural Net","Logistic Regression","GAN"], "answer": 2},
                ]
            },
        ]
        return {"scenarios": scenarios}

    @app.post('/api/simulations/score')
    def simulations_score():
        user = current_user()
        if not user:
            return jsonify({"error": "unauthorized"}), 401
        payload = request.json or {}
        sim_id = payload.get('id')
        answers = payload.get('answers', {})
        sims = {s['id']: s for s in simulations().get_json()['scenarios']}
        if sim_id not in sims:
            return jsonify({"error": "invalid simulation"}), 400
        sim = sims[sim_id]
        total = len(sim['questions'])
        correct = 0
        for q in sim['questions']:
            sel = answers.get(q['id'])
            if isinstance(sel, int) and sel == q['answer']:
                correct += 1
        score = int(round((correct/total)*100)) if total else 0
        # Recommend roles weighted by simulation's primary career
        recommendations = [
            {"title": sim['career'], "suitability": min(100, score + 20)},
        ]
        return {"score": score, "recommendations": recommendations}

    # Admin CRUD for tests and questions
    @app.get('/api/admin/tests')
    def admin_tests_list():
        user = current_user()
        if not user or user.role != 'admin':
            return jsonify({"error": "forbidden"}), 403
        tests = AptitudeTest.query.order_by(AptitudeTest.id.desc()).all()
        return [{"id": t.id, "name": t.name, "created_at": t.created_at.isoformat()} for t in tests]

    @app.post('/api/admin/tests')
    def admin_tests_add():
        user = current_user()
        if not user or user.role != 'admin':
            return jsonify({"error": "forbidden"}), 403
        data = request.json or {}
        name = data.get('name')
        if not name:
            return jsonify({"error": "name required"}), 400
        t = AptitudeTest(name=name)
        db.session.add(t)
        db.session.commit()
        return {"id": t.id, "name": t.name, "created_at": t.created_at.isoformat()}

    @app.delete('/api/admin/tests/<int:tid>')
    def admin_tests_delete(tid):
        user = current_user()
        if not user or user.role != 'admin':
            return jsonify({"error": "forbidden"}), 403
        t = AptitudeTest.query.get(tid)
        if not t:
            return jsonify({"error": "not found"}), 404
        db.session.delete(t)
        db.session.commit()
        return {"message": "deleted"}

    @app.get('/api/admin/questions')
    def admin_questions_list():
        user = current_user()
        if not user or user.role != 'admin':
            return jsonify({"error": "forbidden"}), 403
        test_id = request.args.get('test_id', type=int)
        q = AptitudeQuestion.query
        if test_id:
            q = q.filter_by(test_id=test_id)
        questions = q.order_by(AptitudeQuestion.id.desc()).all()
        return [{"id": x.id, "test_id": x.test_id, "text": x.text, "topic": x.topic, "correct": x.correct} for x in questions]

    @app.post('/api/admin/questions')
    def admin_questions_add():
        user = current_user()
        if not user or user.role != 'admin':
            return jsonify({"error": "forbidden"}), 403
        data = request.json or {}
        test_id = data.get('test_id')
        textv = data.get('text')
        topic = data.get('topic')
        correct = data.get('correct')
        if not test_id or not textv:
            return jsonify({"error": "test_id and text required"}), 400
        q = AptitudeQuestion(test_id=test_id, text=textv, topic=topic, correct=correct)
        db.session.add(q)
        db.session.commit()
        return {"id": q.id, "test_id": q.test_id, "text": q.text, "topic": q.topic, "correct": q.correct}

    @app.delete('/api/admin/questions/<int:qid>')
    def admin_questions_delete(qid):
        user = current_user()
        if not user or user.role != 'admin':
            return jsonify({"error": "forbidden"}), 403
        q = AptitudeQuestion.query.get(qid)
        if not q:
            return jsonify({"error": "not found"}), 404
        db.session.delete(q)
        db.session.commit()
        return {"message": "deleted"}

    # DANGEROUS: wipe all users and user-owned data. Admin-only, requires confirm token.
    @app.post('/api/admin/wipe-all')
    def admin_wipe_all():
        user = current_user()
        if not user or user.role != 'admin':
            return jsonify({"error": "forbidden"}), 403
        data = request.json or {}
        if data.get('confirm') != 'WIPE_CONFIRM':
            return jsonify({"error": "confirmation_required", "hint": "send {confirm: 'WIPE_CONFIRM'}"}), 400
        # Delete in order of FKs to users
        try:
            Recommendation.query.delete()
            TestResult.query.delete()
            LearningGoal.query.delete()
            PortfolioItem.query.delete()
            CareerBookmark.query.delete()
            StudentProfile.query.delete()
            # Finally users
            User.query.delete()
            db.session.commit()
            return {"message": "all users and related data deleted"}
        except Exception as e:
            db.session.rollback()
            return jsonify({"error": "wipe_failed", "detail": str(e)}), 500

    return app

if __name__ == '__main__':
    app = create_app()
    with app.app_context():
        db.create_all()
    app.run(host='0.0.0.0', port=5000, debug=True)
