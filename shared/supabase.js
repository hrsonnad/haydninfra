// Supabase Configuration
var SUPABASE_URL = 'https://ixxnhvqyxkuwyshzdnlc.supabase.co';
var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml4eG5odnF5eGt1d3lzaHpkbmxjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3NTk2MTMsImV4cCI6MjA4ODMzNTYxM30.DB2xXD4EPOKA2WzfrTnJ7YMZRU8yCXcU5y6f-tT3V-g';

// Initialize Supabase client
const supabase = window.supabase
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

// Storage helpers
const STORAGE = {
    documents: {
        bucket: 'documents',
        getUrl: (path) => `${SUPABASE_URL}/storage/v1/object/documents/${path}`,
    },
    avatars: {
        bucket: 'avatars',
        getPublicUrl: (path) => `${SUPABASE_URL}/storage/v1/object/public/avatars/${path}`,
    },
};
