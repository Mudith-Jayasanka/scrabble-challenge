import { Injectable } from '@angular/core';
import { MongoClient, Db } from 'mongodb';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class MongoService {
  private db: Db | undefined;
  // The connection string is loaded from the environment file.
  private uri = environment.mongodb_uri; 
  private client: MongoClient;

  constructor() {
    // IMPORTANT: Replace <db_password> in your `src/environments/environment.ts` file.
    this.client = new MongoClient(this.uri);
  }

  /**
   * Connects to the MongoDB database.
   */
  async connect(): Promise<void> {
    try {
      await this.client.connect();
      // --- IMPORTANT ---
      // You must specify the database name you want to connect to.
      // Replace 'your_database_name' with your actual database name.
      this.db = this.client.db('your_database_name'); 
      console.log('Successfully connected to MongoDB');
    } catch (error) {
      console.error('Error connecting to MongoDB', error);
      // Re-throw the error to be handled by the calling code
      throw error;
    }
  }

  /**
   * Returns the database instance.
   * @returns {Db} The database instance.
   * @throws {Error} If the database is not initialized.
   */
  getDb(): Db {
    if (!this.db) {
      throw new Error('Database not initialized. Call connect() first.');
    }
    return this.db;
  }

  /**
   * Closes the database connection.
   */
  async close(): Promise<void> {
    if (this.client) {
      await this.client.close();
    }
  }
}