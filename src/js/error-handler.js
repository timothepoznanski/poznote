/**
 * Global Error Handler
 * Catches JavaScript errors and unhandled promise rejections for debugging
 */

(function() {
    'use strict';

    // Global error handler to catch all JavaScript errors
    window.addEventListener('error', function(event) {
        console.error('JavaScript Error caught:', {
            message: event.message,
            filename: event.filename,
            lineno: event.lineno,
            colno: event.colno,
            error: event.error,
            stack: event.error ? event.error.stack : 'No stack trace available'
        });
        
        // Specific handling for syntax errors that might prevent settings from working
        if (event.message.includes('Unexpected end of input') || event.message.includes('SyntaxError')) {
            console.warn('Syntax error detected - this may prevent display settings from working properly');
        }
        
        // Store in sessionStorage for inspection
        try {
            var errorInfo = {
                timestamp: new Date().toISOString(),
                message: event.message,
                filename: event.filename,
                lineno: event.lineno,
                colno: event.colno,
                stack: event.error ? event.error.stack : 'No stack trace'
            };
            sessionStorage.setItem('lastJSError', JSON.stringify(errorInfo));
        } catch (e) {
            // Ignore storage errors
        }
    });
    
    // Catch unhandled promise rejections
    window.addEventListener('unhandledrejection', function(event) {
        console.error('Unhandled Promise Rejection:', event.reason);
        try {
            var errorInfo = {
                timestamp: new Date().toISOString(),
                type: 'Promise Rejection',
                reason: event.reason.toString(),
                stack: event.reason.stack || 'No stack trace'
            };
            sessionStorage.setItem('lastPromiseError', JSON.stringify(errorInfo));
        } catch (e) {
            // Ignore storage errors
        }
    });
    
    // Helper function to check last errors (callable from console)
    window.checkLastErrors = function() {
        try {
            var lastJSError = sessionStorage.getItem('lastJSError');
            var lastPromiseError = sessionStorage.getItem('lastPromiseError');
            
            if (lastJSError) {
                console.log('Last JavaScript Error:', JSON.parse(lastJSError));
            }
            if (lastPromiseError) {
                console.log('Last Promise Error:', JSON.parse(lastPromiseError));
            }
            
            if (!lastJSError && !lastPromiseError) {
                console.log('No recent errors found.');
            }
        } catch (e) {
            console.log('Error checking stored errors:', e);
        }
    };
})();
