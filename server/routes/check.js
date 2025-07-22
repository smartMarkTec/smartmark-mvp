const express = require('express');
const app = require('./server'); // Adjust path if needed

function printRoutes(app) {
  if (!app._router) {
    console.log('No router registered yet');
    process.exit();
  }
  console.log('\n=== Registered Routes ===');
  app._router.stack.forEach((middleware) => {
    if (middleware.route) { // routes registered directly on the app
      const methods = Object.keys(middleware.route.methods).join(', ').toUpperCase();
      console.log(`${methods} ${middleware.route.path}`);
    } else if (middleware.name === 'router') { // router middleware 
      middleware.handle.stack.forEach((handler) => {
        const route = handler.route;
        if (route) {
          const methods = Object.keys(route.methods).join(', ').toUpperCase();
          console.log(`${methods} ${route.path}`);
        }
      });
    }
  });
}
printRoutes(app);
