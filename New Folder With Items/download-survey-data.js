// Download Survey Data Script
// Run this with Node.js to export all survey data from Firebase

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { getFirestore, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";
import fs from 'fs';

// Firebase configuration
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBqMJlchU_luM5-XcPo0USDUjsM60Qfoqg",
  authDomain: "our-daily.firebaseapp.com",
  projectId: "our-daily",
  storageBucket: "our-daily.firebasestorage.app",
  messagingSenderId: "337201931314",
  appId: "1:337201931314:web:fb5677846d03eb285ac82b",
  measurementId: "G-65XB7QC1F4"
};

async function downloadSurveyData() {
  try {
    console.log('🔧 Initializing Firebase...');
    const app = initializeApp(FIREBASE_CONFIG);
    const db = getFirestore(app);
    
    console.log('🔧 Fetching all survey data...');
    const surveysCollection = collection(db, "surveys");
    const querySnapshot = await getDocs(surveysCollection);
    
    const allSurveys = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      allSurveys.push({
        id: doc.id,
        ...data
      });
    });
    
    console.log(`✅ Found ${allSurveys.length} surveys in database`);
    
    // Create comprehensive export
    const exportData = {
      exportTimestamp: new Date().toISOString(),
      exportSummary: {
        totalSurveys: allSurveys.length,
        totalResponses: allSurveys.reduce((sum, survey) => sum + (survey.responses ? survey.responses.length : 0), 0),
        dateRange: {
          start: allSurveys.length > 0 ? allSurveys[allSurveys.length - 1].timestamp : null,
          end: allSurveys.length > 0 ? allSurveys[0].timestamp : null
        }
      },
      surveys: allSurveys
    };
    
    // Save to file
    const filename = `survey-data-${new Date().toISOString().split('T')[0]}.json`;
    fs.writeFileSync(filename, JSON.stringify(exportData, null, 2));
    
    console.log(`✅ Survey data exported to: ${filename}`);
    console.log(`📊 Summary:`);
    console.log(`   - Total surveys: ${exportData.exportSummary.totalSurveys}`);
    console.log(`   - Total responses: ${exportData.exportSummary.totalResponses}`);
    console.log(`   - Date range: ${exportData.exportSummary.dateRange.start} to ${exportData.exportSummary.dateRange.end}`);
    
  } catch (error) {
    console.error('❌ Failed to download survey data:', error);
  }
}

// Run the export
downloadSurveyData(); 