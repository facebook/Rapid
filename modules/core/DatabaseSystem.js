import { AbstractSystem } from './AbstractSystem.js';


/**
 * `DatabaseSystem` is a wrapper around `IndexedDB`
 * It is used to store larger amounts of data asynchronously,
 * such as the user's edit history.
 */
export class DatabaseSystem extends AbstractSystem {
  /**
   * @constructor
   * @param  context  Global shared application context
   * @param  dbName   Name of the database
   * @param  version  Version of the database
   */
  constructor(context, dbName = 'myDatabase', version = 1) {
    super(context);
    this.id = 'database';
    this.dependencies = new Set();
    this.dbName = dbName;
    this.version = version;
    this.db = null;
  }
  /**
   * initAsync
   * Called after all core objects have been constructed.
   * @return {Promise} Promise resolved when this component has completed initialization
   */
  initAsync() {
    for (const id of this.dependencies) {
      if (!this.context.systems[id]) {
        return Promise.reject(`Cannot init: ${this.id} requires ${id}`);
      }
    }

    return this.open()
      .then(() => {
        // Initialization successful
      })
      .catch((error) => {
        console.error('Failed to initialize:', error);
      });
  }


  /**
   * open
   * Opens a connection to the IndexedDB database
   */
  open() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 2);
      request.onupgradeneeded = (event) => {
        this.db = event.target.result;
        try {
          if (!this.db.objectStoreNames.contains('editHistory')) {
            this.db.createObjectStore('editHistory', { keyPath: 'id', autoIncrement: true });
          }
          if (!this.db.objectStoreNames.contains('backups')) {
            this.db.createObjectStore('backups', { keyPath: 'id' });
          }
        } catch (error) {
         // eslint-disable-next-line no-console
          console.error('Error during onupgradeneeded:', error);
        }
      };
      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve(this.db);
      };
      request.onerror = (event) => {
        // eslint-disable-next-line no-console
        console.error('Database error:', event.target.error);
        reject(`Database error: ${event.target.errorCode}`);
      };
    });
  }


  /**
   * add
   * Adds data to the specified object store
   * @param storeName Name of the object store
   * @param data Data to add
   */
  add(storeName, data) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.add(data);

      request.onsuccess = () => resolve();
      request.onerror = (event) => {
         // eslint-disable-next-line no-console
        console.error('Add error:', event.target.error);
        reject(`Add error: ${event.target.errorCode}`);
      };
    });
  }


  /**
   * get
   * Retrieves data by key from the specified object store
   * @param storeName Name of the object store
   * @param key Key of the data to retrieve
   */
  get(storeName, key) {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const transaction = this.db.transaction(storeName, 'readonly');
            const store = transaction.objectStore(storeName);
      const request = store.get(key);

      request.onsuccess = (event) => resolve(event.target.result);
      request.onerror = (event) => reject(`Get error: ${event.target.errorCode}`);
    });
  }


  /**
   * update
   * Updates existing data in the specified object store
   * @param storeName Name of the object store
   * @param data Data to update
   */
  update(storeName, data) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.put(data);

      request.onsuccess = () => resolve();
      request.onerror = (event) => reject(`Update error: ${event.target.errorCode}`);
    });
  }


  /**
   * put
   * Inserts or updates data in the specified object store
   * @param storeName Name of the object store
   * @param data Data to insert or update
   */
  put(storeName, data) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.put(data);

      request.onsuccess = () => resolve();
      request.onerror = (event) => {
         // eslint-disable-next-line no-console
        console.error('Put error:', event.target.error);
        reject(`Put error: ${event.target.errorCode}`);
      };
    });
  }


  /**
   * delete
   * Deletes data by key from the specified object store
   * @param storeName Name of the object store
   * @param key Key of the data to delete
   */
  delete(storeName, key) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.delete(key);

      request.onsuccess = () => resolve();
      request.onerror = (event) => reject(`Delete error: ${event.target.errorCode}`);
    });
  }


  /**
   * clear
   * Clears all data from the specified object store
   * @param storeName Name of the object store
   */
  clear(storeName) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = (event) => reject(`Clear error: ${event.target.errorCode}`);
    });
  }


  /**
   * close
   * Closes the database connection
   */
  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}