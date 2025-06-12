#!/usr/bin/env python3
"""
Gmail Bulk Delete Tool - Flask Application
This application provides a web interface for bulk deleting Gmail emails
with both demo and live modes.
"""

import os
import json
import time
import random
from datetime import datetime, timedelta
from flask import Flask, render_template, request, jsonify, session
from flask_cors import CORS
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', 'your-secret-key-here')
CORS(app)

# OAuth 2.0 Configuration
CLIENT_ID = "10662346000-hakn2nmmhvd711oin1tkst7pj2hc5fnj.apps.googleusercontent.com"
CLIENT_SECRET = "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"
REDIRECT_URI = "http://localhost:5000/oauth2callback"
SCOPES = ['https://www.googleapis.com/auth/gmail.modify']

# OAuth2 client configuration
CLIENT_CONFIG = {
    "web": {
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
        "token_uri": "https://oauth2.googleapis.com/token",
        "redirect_uris": [REDIRECT_URI]
    }
}

@app.route('/')
def index():
    """Render the main application page."""
    return render_template('index.html')

@app.route('/api/auth/status')
def auth_status():
    """Check if user is authenticated."""
    is_authenticated = 'credentials' in session
    return jsonify({'authenticated': is_authenticated})

@app.route('/api/auth/start')
def auth_start():
    """Start the OAuth2 authentication flow."""
    flow = Flow.from_client_config(
        CLIENT_CONFIG,
        scopes=SCOPES,
        redirect_uri=REDIRECT_URI
    )
    
    authorization_url, state = flow.authorization_url(
        access_type='offline',
        include_granted_scopes='true'
    )
    
    session['state'] = state
    return jsonify({'auth_url': authorization_url})

@app.route('/oauth2callback')
def oauth2callback():
    """Handle the OAuth2 callback."""
    state = session.get('state')
    
    flow = Flow.from_client_config(
        CLIENT_CONFIG,
        scopes=SCOPES,
        state=state,
        redirect_uri=REDIRECT_URI
    )
    
    authorization_response = request.url
    flow.fetch_token(authorization_response=authorization_response)
    
    credentials = flow.credentials
    session['credentials'] = {
        'token': credentials.token,
        'refresh_token': credentials.refresh_token,
        'token_uri': credentials.token_uri,
        'client_id': credentials.client_id,
        'client_secret': credentials.client_secret,
        'scopes': credentials.scopes
    }
    
    return render_template('auth_success.html')

@app.route('/api/auth/logout')
def logout():
    """Log out the user by clearing session."""
    session.clear()
    return jsonify({'success': True})

@app.route('/api/labels')
def get_labels():
    """Get Gmail labels for the authenticated user."""
    if 'credentials' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    try:
        credentials = Credentials(**session['credentials'])
        service = build('gmail', 'v1', credentials=credentials)
        
        results = service.users().labels().list(userId='me').execute()
        labels = results.get('labels', [])
        
        # Format labels for frontend
        formatted_labels = []
        for i, label in enumerate(labels):
            label_type = 'system' if label['type'] == 'system' else 'user'
            formatted_labels.append({
                'id': label['id'],
                'name': label['name'],
                'type': label_type,
                'index': i + 1
            })
        
        return jsonify({'labels': formatted_labels})
    
    except HttpError as error:
        logger.error(f"An error occurred: {error}")
        return jsonify({'error': str(error)}), 500

@app.route('/api/search', methods=['POST'])
def search_emails():
    """Search for emails based on criteria."""
    if 'credentials' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    data = request.json
    label_id = data.get('label_id')
    start_date = data.get('start_date')
    end_date = data.get('end_date')
    
    try:
        credentials = Credentials(**session['credentials'])
        service = build('gmail', 'v1', credentials=credentials)
        
        # Build query
        query_parts = []
        if label_id:
            if label_id in ['INBOX', 'SENT', 'DRAFT', 'SPAM', 'TRASH']:
                query_parts.append(f'in:{label_id.lower()}')
            else:
                query_parts.append(f'label:{label_id}')
        
        if start_date:
            query_parts.append(f'after:{start_date}')
        
        if end_date:
            query_parts.append(f'before:{end_date}')
        
        query = ' '.join(query_parts)
        
        # Get message IDs
        messages = []
        page_token = None
        
        while True:
            results = service.users().messages().list(
                userId='me',
                q=query,
                pageToken=page_token
            ).execute()
            
            messages.extend(results.get('messages', []))
            page_token = results.get('nextPageToken')
            
            if not page_token:
                break
        
        return jsonify({
            'count': len(messages),
            'query': query,
            'message_ids': [msg['id'] for msg in messages]
        })
    
    except HttpError as error:
        logger.error(f"An error occurred: {error}")
        return jsonify({'error': str(error)}), 500

@app.route('/api/delete', methods=['POST'])
def delete_emails():
    """Delete emails in batches."""
    if 'credentials' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    data = request.json
    message_ids = data.get('message_ids', [])
    
    if not message_ids:
        return jsonify({'error': 'No message IDs provided'}), 400
    
    try:
        credentials = Credentials(**session['credentials'])
        service = build('gmail', 'v1', credentials=credentials)
        
        # Delete in batches
        batch_size = 100
        deleted_count = 0
        
        for i in range(0, len(message_ids), batch_size):
            batch = message_ids[i:i + batch_size]
            
            # Use batch request for efficiency
            batch_request = service.new_batch_http_request()
            
            for msg_id in batch:
                batch_request.add(
                    service.users().messages().trash(
                        userId='me',
                        id=msg_id
                    )
                )
            
            batch_request.execute()
            deleted_count += len(batch)
            
            # Send progress update
            progress = (deleted_count / len(message_ids)) * 100
            
            # Simulate some delay for demo purposes
            time.sleep(0.5)
        
        return jsonify({
            'success': True,
            'deleted_count': deleted_count,
            'total_count': len(message_ids)
        })
    
    except HttpError as error:
        logger.error(f"An error occurred: {error}")
        return jsonify({'error': str(error)}), 500

@app.route('/api/demo/run', methods=['POST'])
def run_demo():
    """Run the demo simulation."""
    steps = [
        {'type': 'command', 'text': 'python gmail_bulk_delete.py', 'delay': 1000},
        {'type': 'output', 'text': 'Initializing Gmail API connection...', 'delay': 500},
        {'type': 'success', 'text': '✓ Authentication successful!', 'delay': 1000},
        {'type': 'output', 'text': '', 'delay': 200},
        {'type': 'output', 'text': 'Available mailboxes/labels:', 'delay': 500},
        {'type': 'output', 'text': '-' * 40, 'delay': 200},
        {'type': 'output', 'text': ' 1. INBOX (System)', 'delay': 300},
        {'type': 'output', 'text': ' 2. SENT (System)', 'delay': 300},
        {'type': 'output', 'text': ' 3. DRAFT (System)', 'delay': 300},
        {'type': 'output', 'text': ' 4. SPAM (System)', 'delay': 300},
        {'type': 'output', 'text': ' 5. TRASH (System)', 'delay': 300},
        {'type': 'output', 'text': ' 6. Work Projects (User)', 'delay': 300},
        {'type': 'output', 'text': ' 7. Newsletters (User)', 'delay': 300},
        {'type': 'output', 'text': ' 8. Social Media (User)', 'delay': 300},
        {'type': 'output', 'text': '', 'delay': 500},
        {'type': 'command', 'text': 'Selection: 7 (Newsletters)', 'delay': 1000},
        {'type': 'success', 'text': 'Selected: Newsletters', 'delay': 500},
        {'type': 'output', 'text': '', 'delay': 300},
        {'type': 'command', 'text': 'Date Range: 2023-01-01 to 2024-01-01', 'delay': 1000},
        {'type': 'output', 'text': 'Building search query: label:Newsletters after:2023/01/01 before:2024/01/01', 'delay': 1000},
        {'type': 'warning', 'text': 'Scanning Gmail API for matching emails...', 'delay': 1500},
        {'type': 'success', 'text': 'Found 2,847 emails matching criteria', 'delay': 1000, 'updateStats': {'found': 2847}},
        {'type': 'warning', 'text': 'Confirm deletion of 2,847 emails? [Y/n]: Y', 'delay': 1000},
        {'type': 'success', 'text': 'Starting batch deletion process...', 'delay': 500},
        {'type': 'success', 'text': 'Batch 1: Deleted 100/2847 emails (3.5%)', 'delay': 800, 'updateStats': {'deleted': 100, 'progress': 3.5}},
        {'type': 'success', 'text': 'Batch 5: Deleted 500/2847 emails (17.6%)', 'delay': 800, 'updateStats': {'deleted': 500, 'progress': 17.6}},
        {'type': 'success', 'text': 'Batch 10: Deleted 1000/2847 emails (35.1%)', 'delay': 800, 'updateStats': {'deleted': 1000, 'progress': 35.1}},
        {'type': 'success', 'text': 'Batch 15: Deleted 1500/2847 emails (52.7%)', 'delay': 800, 'updateStats': {'deleted': 1500, 'progress': 52.7}},
        {'type': 'success', 'text': 'Batch 20: Deleted 2000/2847 emails (70.2%)', 'delay': 800, 'updateStats': {'deleted': 2000, 'progress': 70.2}},
        {'type': 'success', 'text': 'Batch 25: Deleted 2500/2847 emails (87.8%)', 'delay': 800, 'updateStats': {'deleted': 2500, 'progress': 87.8}},
        {'type': 'success', 'text': 'Batch 29: Deleted 2847/2847 emails (100%)', 'delay': 800, 'updateStats': {'deleted': 2847, 'progress': 100}},
        {'type': 'output', 'text': '', 'delay': 500},
        {'type': 'success', 'text': '✓ OPERATION COMPLETED SUCCESSFULLY!', 'delay': 1000, 'updateStats': {'timeSaved': 95}},
        {'type': 'output', 'text': '', 'delay': 300},
        {'type': 'info', 'text': 'Performance Summary:', 'delay': 500},
        {'type': 'info', 'text': '• Total emails deleted: 2,847', 'delay': 300},
        {'type': 'info', 'text': '• Time saved vs manual: ~95 minutes', 'delay': 300},
        {'type': 'info', 'text': '• API batches used: 29 (vs 57 manual)', 'delay': 300},
        {'type': 'success', 'text': '• Efficiency improvement: 49% faster!', 'delay': 500},
        {'type': 'command', 'text': '', 'delay': 1000, 'showCursor': True}
    ]
    
    return jsonify({'steps': steps})

if __name__ == '__main__':
    app.run(debug=True, port=5000)