/**
 * Archive Update Script
 * Can be run daily to update the archive with new quilt data
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, collection, getDocs, query, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

import { CONFIG } from './config.js';
import { getTodayKey, formatDate } from './utils.js';

class ArchiveUpdater {
  constructor() {
    this.db = null;
  }

  /**
   * Initialize Firebase
   */
  async initializeFirebase() {
    try {
      const app = initializeApp(CONFIG.FIREBASE);
      this.db = getFirestore(app);
      console.log('Firebase initialized for archive update');
    } catch (error) {
      console.error('Firebase initialization error:', error);
      throw error;
    }
  }

  /**
   * Update archive with today's quilt data
   */
  async updateArchive() {
    try {
      console.log('Starting archive update...');
      
      const today = new Date();
      const todayKey = getTodayKey();
      
      // Get today's quilt data
      const quiltDoc = doc(this.db, "quilts", "main");
      const quiltSnapshot = await getDoc(quiltDoc);
      
      if (!quiltSnapshot.exists()) {
        console.log('No quilt data found for today');
        return;
      }
      
      const quiltData = quiltSnapshot.data();
      
      if (!quiltData.blocks || quiltData.blocks.length === 0) {
        console.log('No quilt blocks found for today');
        return;
      }
      
      // Create archive entry
      const archiveEntry = {
        date: todayKey,
        blocks: quiltData.blocks,
        contributorCount: this.calculateContributorCount(quiltData.blocks),
        lastUpdated: today.toISOString()
      };
      
      // Save to archive collection
      const archiveDoc = doc(this.db, "archive", todayKey);
      await setDoc(archiveDoc, archiveEntry);
      
      console.log(`Archive updated for ${todayKey} with ${archiveEntry.contributorCount} contributors`);
      
    } catch (error) {
      console.error('Archive update error:', error);
      throw error;
    }
  }

  /**
   * Calculate contributor count from blocks
   */
  calculateContributorCount(blocks) {
    if (!blocks || !Array.isArray(blocks)) return 0;
    
    const uniqueColors = new Set();
    blocks.forEach(block => {
      if (block.color) {
        uniqueColors.add(block.color);
      }
    });
    
    return uniqueColors.size;
  }

  /**
   * Clean up old archive entries (keep last 30 days)
   */
  async cleanupOldEntries() {
    try {
      console.log('Cleaning up old archive entries...');
      
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const archiveRef = collection(this.db, "archive");
      const q = query(archiveRef, orderBy("lastUpdated", "desc"));
      const querySnapshot = await getDocs(q);
      
      const entriesToDelete = [];
      
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        const entryDate = new Date(data.lastUpdated);
        
        if (entryDate < thirtyDaysAgo) {
          entriesToDelete.push(doc.id);
        }
      });
      
      console.log(`Found ${entriesToDelete.length} old entries to clean up`);
      
      // Note: In a production environment, you would implement the actual deletion
      // For now, we'll just log what would be deleted
      entriesToDelete.forEach(entryId => {
        console.log(`Would delete archive entry: ${entryId}`);
      });
      
    } catch (error) {
      console.error('Cleanup error:', error);
    }
  }

  /**
   * Run the complete archive update process
   */
  async run() {
    try {
      await this.initializeFirebase();
      await this.updateArchive();
      await this.cleanupOldEntries();
      
      console.log('Archive update completed successfully');
    } catch (error) {
      console.error('Archive update failed:', error);
      process.exit(1);
    }
  }
}

// Run the updater if this script is executed directly
if (typeof window === 'undefined') {
  // Node.js environment
  const updater = new ArchiveUpdater();
  updater.run().then(() => {
    console.log('Archive update script completed');
    process.exit(0);
  }).catch((error) => {
    console.error('Archive update script failed:', error);
    process.exit(1);
  });
}

export { ArchiveUpdater }; 