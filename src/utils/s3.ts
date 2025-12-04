import AWS from "aws-sdk";

// Configure AWS S3 with proper credential handling
export const initializeS3 = () => {
  // Check if credentials are available
  const hasCredentials = process.env.AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY;
  const hasSecret = process.env.AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_KEY;
  const hasBucket = process.env.AWS_BUCKET_NAME;


  if (!hasCredentials || !hasSecret || !hasBucket) {
    console.warn('⚠️  AWS credentials or bucket not configured. S3 functionality will be disabled.');
    return null;
  }

  console.log('✅ AWS S3 initialized successfully!');
  

  return new AWS.S3({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_KEY,
    region: process.env.AWS_REGION || 'us-east-1',
    maxRetries: 3
  });
};

const s3 = initializeS3();

/**
 * Check if S3 is properly configured and available
 * @returns boolean indicating if S3 is available
 */
export const isS3Available = (): boolean => {
  return s3 !== null;
};

export interface S3UploadResult {
  Location: string;
  Bucket: string;
  Key: string;
  ETag: string;
}

/**
 * Upload data to S3 bucket as JSON file
 * @param keyName - The S3 object key (file path)
 * @param data - The data to upload (will be JSON stringified)
 * @returns Promise with upload result
 */
/**
 * Upload image buffer to S3 bucket
 * @param keyName - The S3 object key (file path)
 * @param imageBuffer - The image buffer data
 * @param contentType - The image content type (e.g., 'image/jpeg', 'image/png')
 * @returns Promise with upload result and public URL
 */
export const uploadImageToS3 = async (
  keyName: string, 
  imageBuffer: Buffer, 
  contentType: string = 'image/jpeg'
): Promise<S3UploadResult & { publicUrl: string }> => {
  try {
    // Check if S3 is configured
    if (!s3) {
      throw new Error('S3 is not configured. Please set AWS credentials in environment variables.');
    }
    
    // Validate required environment variables
    if (!process.env.AWS_BUCKET_NAME) {
      throw new Error('AWS_BUCKET_NAME environment variable is required');
    }

    const params: AWS.S3.PutObjectRequest = {
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: keyName,
      Body: imageBuffer,
      ContentType: contentType,
      ServerSideEncryption: 'AES256',
      ACL: 'public-read', // Make images publicly accessible
      Metadata: {
        'uploaded-by': 'freepik-service',
        'upload-timestamp': new Date().toISOString(),
        'content-type': contentType
      }
    };

    console.log(`🖼️  Uploading image to S3: s3://${params.Bucket}/${keyName}`);
    const result = await s3.upload(params).promise();
    
    // Generate public URL
    const publicUrl = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${keyName}`;
    
    console.log(`✅ Image uploaded successfully. Public URL: ${publicUrl}`);
    
    return {
      Location: result.Location,
      Bucket: result.Bucket,
      Key: result.Key,
      ETag: result.ETag,
      publicUrl
    };
  } catch (error) {
    console.error('❌ S3 image upload failed:', error);
    throw new Error(`Failed to upload image to S3: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

export const uploadToS3 = async (keyName: string, data: any): Promise<S3UploadResult> => {
  try {
    // Check if S3 is configured
    if (!s3) {
      throw new Error('S3 is not configured. Please set AWS credentials in environment variables.');
    }
    
    // Validate required environment variables
    if (!process.env.AWS_BUCKET_NAME) {
      throw new Error('AWS_BUCKET_NAME environment variable is required');
    }

    const params: AWS.S3.PutObjectRequest = {
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: keyName,
      Body: JSON.stringify(data, null, 2),
      ContentType: "application/json",
      ServerSideEncryption: 'AES256',
      Metadata: {
        'uploaded-by': 'britannia-scraper',
        'upload-timestamp': new Date().toISOString()
      }
    };

    console.log(`📤 Uploading to S3: s3://${params.Bucket}/${keyName}`);
    const result = await s3.upload(params).promise();
    
    return {
      Location: result.Location,
      Bucket: result.Bucket,
      Key: result.Key,
      ETag: result.ETag
    };
  } catch (error) {
    console.error('❌ S3 upload failed:', error);
    throw new Error(`Failed to upload to S3: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

/**
 * Download data from S3 bucket
 * @param keyName - The S3 object key (file path)
 * @returns Promise with parsed JSON data
 */
export const downloadFromS3 = async (keyName: string): Promise<any> => {
  try {
    if (!s3) {
      throw new Error('S3 is not configured. Please set AWS credentials in environment variables.');
    }
    
    if (!process.env.AWS_BUCKET_NAME) {
      throw new Error('AWS_BUCKET_NAME environment variable is required');
    }

    const params: AWS.S3.GetObjectRequest = {
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: keyName
    };

    console.log(`📥 Downloading from S3: s3://${params.Bucket}/${keyName}`);
    const result = await s3.getObject(params).promise();
    
    if (!result.Body) {
      throw new Error('No data found in S3 object');
    }
    
    const jsonData = JSON.parse(result.Body.toString());
    return jsonData;
  } catch (error) {
    console.error('❌ S3 download failed:', error);
    throw new Error(`Failed to download from S3: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

/**
 * Delete object from S3 bucket
 * @param keyName - The S3 object key (file path) to delete
 * @returns Promise indicating success
 */
export const deleteFromS3 = async (keyName: string): Promise<void> => {
  try {
    if (!s3) {
      throw new Error('S3 is not configured. Please set AWS credentials in environment variables.');
    }
    
    if (!process.env.AWS_BUCKET_NAME) {
      throw new Error('AWS_BUCKET_NAME environment variable is required');
    }

    const params: AWS.S3.DeleteObjectRequest = {
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: keyName
    };

    console.log(`🗑️  Deleting from S3: s3://${params.Bucket}/${keyName}`);
    await s3.deleteObject(params).promise();
    console.log(`✅ Successfully deleted: ${keyName}`);
  } catch (error) {
    console.error('❌ S3 delete failed:', error);
    throw new Error(`Failed to delete from S3: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

/**
 * Delete multiple objects from S3 bucket
 * @param keyNames - Array of S3 object keys to delete
 * @returns Promise indicating success
 */
export const deleteMultipleFromS3 = async (keyNames: string[]): Promise<void> => {
  try {
    if (!s3) {
      throw new Error('S3 is not configured. Please set AWS credentials in environment variables.');
    }
    
    if (!process.env.AWS_BUCKET_NAME) {
      throw new Error('AWS_BUCKET_NAME environment variable is required');
    }

    if (keyNames.length === 0) {
      console.log('No objects to delete');
      return;
    }

    const params: AWS.S3.DeleteObjectsRequest = {
      Bucket: process.env.AWS_BUCKET_NAME,
      Delete: {
        Objects: keyNames.map(key => ({ Key: key })),
        Quiet: false
      }
    };

    console.log(`🗑️  Deleting ${keyNames.length} objects from S3...`);
    const result = await s3.deleteObjects(params).promise();
    
    if (result.Deleted && result.Deleted.length > 0) {
      console.log(`✅ Successfully deleted ${result.Deleted.length} objects`);
    }
    
    if (result.Errors && result.Errors.length > 0) {
      console.warn(`⚠️  Failed to delete ${result.Errors.length} objects:`, result.Errors);
    }
  } catch (error) {
    console.error('❌ S3 bulk delete failed:', error);
    throw new Error(`Failed to delete objects from S3: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

/**
 * Replace S3 object by deleting old and uploading new
 * @param keyName - The S3 object key (file path)
 * @param data - The new data to upload
 * @returns Promise with upload result
 */
export const replaceInS3 = async (keyName: string, data: any): Promise<S3UploadResult> => {
  try {
    // Check if object exists and delete it
    try {
      console.log(`🔄 Replacing existing file: ${keyName}`);
      await deleteFromS3(keyName);
    } catch (error) {
      // File doesn't exist, which is fine
      console.log(`📝 Creating new file: ${keyName}`);
    }
    
    // Upload the new data
    return await uploadToS3(keyName, data);
  } catch (error) {
    console.error('❌ S3 replace failed:', error);
    throw new Error(`Failed to replace S3 object: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

/**
 * Clean up old scraping files (keep only latest N files)
 * @param prefix - Prefix to filter files (e.g., 'britannia-products/')
 * @param keepCount - Number of latest files to keep (default: 3)
 */
export const cleanupOldFiles = async (prefix: string, keepCount: number = 3): Promise<void> => {
  try {
    if (!s3) {
      throw new Error('S3 is not configured. Please set AWS credentials in environment variables.');
    }
    
    if (!process.env.AWS_BUCKET_NAME) {
      throw new Error('AWS_BUCKET_NAME environment variable is required');
    }

    const params: AWS.S3.ListObjectsV2Request = {
      Bucket: process.env.AWS_BUCKET_NAME,
      Prefix: prefix
    };

    const result = await s3.listObjectsV2(params).promise();
    const objects = result.Contents || [];
    
    if (objects.length <= keepCount) {
      console.log(`📁 Only ${objects.length} files found, no cleanup needed`);
      return;
    }

    // Sort by last modified date (newest first)
    const sortedObjects = objects
      .filter(obj => obj.Key && obj.LastModified)
      .sort((a, b) => (b.LastModified!.getTime() - a.LastModified!.getTime()));

    // Keep only the specified number of latest files
    const objectsToDelete = sortedObjects.slice(keepCount);
    
    if (objectsToDelete.length > 0) {
      const keysToDelete = objectsToDelete.map(obj => obj.Key!).filter(Boolean);
      console.log(`🧹 Cleaning up ${keysToDelete.length} old files...`);
      await deleteMultipleFromS3(keysToDelete);
    }
  } catch (error) {
    console.error('❌ Cleanup failed:', error);
    throw new Error(`Failed to cleanup old files: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};
