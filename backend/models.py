from datetime import datetime
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()

class User(db.Model):
    __tablename__ = "users"
    id = db.Column(db.Integer, primary_key=True)
    uid = db.Column(db.String(128), unique=True, nullable=False)
    email = db.Column(db.String(255), unique=True, nullable=False)
    role = db.Column(db.String(20), default="student")
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class StudentProfile(db.Model):
    __tablename__ = "student_profiles"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    first_name = db.Column(db.String(100))
    last_name = db.Column(db.String(100))
    student_class = db.Column(db.String(10))
    parent_phone = db.Column(db.String(30))

class AptitudeTest(db.Model):
    __tablename__ = "aptitude_tests"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class AptitudeQuestion(db.Model):
    __tablename__ = "aptitude_questions"
    id = db.Column(db.Integer, primary_key=True)
    test_id = db.Column(db.Integer, db.ForeignKey("aptitude_tests.id"), nullable=False)
    text = db.Column(db.Text, nullable=False)
    topic = db.Column(db.String(80))
    correct = db.Column(db.String(40))

class TestResult(db.Model):
    __tablename__ = "test_results"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    test_id = db.Column(db.Integer, db.ForeignKey("aptitude_tests.id"), nullable=False)
    score = db.Column(db.Float)
    breakdown = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class Recommendation(db.Model):
    __tablename__ = "recommendations"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    title = db.Column(db.String(200))
    suitability = db.Column(db.Float)
    details = db.Column(db.Text)
    is_active = db.Column(db.Boolean, nullable=False, default=True)

class PortfolioItem(db.Model):
    __tablename__ = "portfolio_items"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    name = db.Column(db.String(200))
    url = db.Column(db.Text)
    description = db.Column(db.String(255))
    tags = db.Column(db.String(255))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class LearningGoal(db.Model):
    __tablename__ = "learning_goals"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    skill = db.Column(db.String(120), nullable=False)
    task = db.Column(db.String(255), nullable=False)
    week = db.Column(db.Integer, default=1)
    done = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class CareerBookmark(db.Model):
    __tablename__ = "career_bookmarks"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    title = db.Column(db.String(200), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
