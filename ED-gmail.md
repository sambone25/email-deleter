# Gmail Bulk Delete Tool - Project Structure & Setup

## Project Structure
```
gmail-bulk-delete/
│
├── app.py                    # Main Flask application
├── requirements.txt          # Python dependencies
│
├── templates/               # HTML templates
│   ├── index.html          # Main application page
│   └── auth_success.html   # OAuth success page
│
└── static/                  # Static assets
    ├── css/
    │   └── style.css       # Application styles
    └── js/
        └── main.js         # Frontend JavaScript
```

## Setup Instructions

### 1. Create Project Directory
```bash
mkdir gmail-bulk-delete
cd gmail-bulk-delete
```

### 2. Create Directory Structure
```bash
mkdir -p templates static/css static/js
```

### 3. Create Virtual Environment
```bash
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

### 4. Install Dependencies
```bash
pip install -r requirements.txt
```

### 5. Set Up Google OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable Gmail API:
   - Go to "APIs & Services" > "Library"
   - Search for "Gmail API"
   - Click on it and press "Enable"
4. Create OAuth2 credentials:
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "OAuth client ID"
   - Choose "Web application"
   - Add authorized redirect URI: `http://localhost:5000/oauth2callback`
5. Replace CLIENT_ID and CLIENT_SECRET in `app.py` with your credentials

### 6. Create Environment Variables (Optional)
Create a `.env` file:
```
SECRET_KEY=your-secret-key-here
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
```

Update `app.py` to use environment variables:
```python
from dotenv import load_dotenv
load_dotenv()

CLIENT_ID = os.getenv('GOOGLE_CLIENT_ID')
CLIENT_SECRET = os.getenv('GOOGLE_CLIENT_SECRET')
```

### 7. Run the Application
```bash
python app.py
```

The application will be available at `http://localhost:5000`

## Features

### Demo Mode
- Simulates the email deletion process
- No authentication required
- Shows sample workflow with progress tracking

### Live Mode
- Connects to real Gmail account via OAuth
- Lists actual Gmail labels/folders
- Searches and deletes emails based on criteria
- Real-time progress tracking

## Security Notes

1. **Never commit credentials**: Always use environment variables for sensitive data
2. **HTTPS in production**: Use HTTPS when deploying to production
3. **Token storage**: In production, store OAuth tokens securely (database, encrypted storage)
4. **Rate limiting**: Implement rate limiting to avoid API quota issues

## API Endpoints

- `GET /` - Main application page
- `GET /api/auth/status` - Check authentication status
- `GET /api/auth/start` - Start OAuth flow
- `GET /oauth2callback` - OAuth callback handler
- `GET /api/auth/logout` - Logout user
- `GET /api/labels` - Get Gmail labels
- `POST /api/search` - Search emails
- `POST /api/delete` - Delete emails
- `POST /api/demo/run` - Run demo simulation

## Troubleshooting

### Common Issues

1. **OAuth Error**: Ensure redirect URI matches exactly in Google Console
2. **API Quota Exceeded**: Gmail API has usage limits, implement batching
3. **CORS Issues**: Check Flask-CORS configuration
4. **Session Issues**: Ensure secret key is set properly

### Development Tips

1. Use Flask debug mode for development: `app.run(debug=True)`
2. Check browser console for JavaScript errors
3. Monitor Flask logs for backend errors
4. Test with small batches before bulk operations

## Production Deployment

For production deployment:

1. Use a production WSGI server (Gunicorn, uWSGI)
2. Set up proper SSL/TLS certificates
3. Use a production database for session storage
4. Implement proper logging and monitoring
5. Set appropriate CORS policies
6. Use environment-specific configuration

Example Gunicorn command:
```bash
gunicorn -w 4 -b 0.0.0.0:8000 app:app
```