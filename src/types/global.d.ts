export {};

declare global {
  var mongo: {
    client: import('mongodb').MongoClient | null;
    promise: Promise<import('mongodb').MongoClient> | null;
  };

  var mongoose: {
    conn: import('mongoose').Mongoose | null;
    promise: Promise<import('mongoose').Mongoose> | null;
  };
}
