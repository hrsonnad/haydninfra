// Supabase Configuration — globals read by auth.js
var SUPABASE_URL = 'https://ixxnhvqyxkuwyshzdnlc.supabase.co';
var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml4eG5odnF5eGt1d3lzaHpkbmxjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3NTk2MTMsImV4cCI6MjA4ODMzNTYxM30.DB2xXD4EPOKA2WzfrTnJ7YMZRU8yCXcU5y6f-tT3V-g';

// Storage bucket names
var STORAGE = {
    documents: { bucket: 'documents' },
    avatars: { bucket: 'avatars', publicUrl: SUPABASE_URL + '/storage/v1/object/public/avatars/' },
};
