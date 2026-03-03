import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  Image,
  TextInput,
  ActivityIndicator,
  Platform
} from 'react-native'
import { useAuthContext } from '../auth/AuthProvider'
import { supabase } from '../lib/supabase/client'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Database } from '../lib/database.types'
import { Ionicons } from '@expo/vector-icons'

// Try to import optional modules - will be undefined if not available
let ImagePicker: any = undefined
let base64ArrayBuffer: any = undefined

try {
  ImagePicker = require('expo-image-picker')
  const base64Module = require('base64-arraybuffer')
  base64ArrayBuffer = {
    decode: base64Module.decode
  }
} catch (error) {
  console.log('Could not load image picker modules', error)
}

// Check if we have ImagePicker capability
const hasImagePickerSupport = !!ImagePicker

// Define a proper profile type based on the Database type
type Profile = Database['public']['Tables']['profiles']['Row']

export default function ProfileScreen() {
  const { user, signOut } = useAuthContext()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  
  // Editable fields state
  const [name, setName] = useState('')
  const [bio, setBio] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)

  // Fetch user profile on mount
  useEffect(() => {
    async function fetchProfile() {
      try {
        if (!user) return

        setLoading(true)
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single()

        if (error) {
          console.error('Error fetching profile:', error)
        } else {
          setProfile(data)
          // Initialize editable fields
          setName(data?.name || '')
          setBio(data?.bio || '')
          setAvatarUrl(data?.avatar_url)
        }
      } catch (error) {
        console.error('Error in fetchProfile:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchProfile()
  }, [user])

  const handleSignOut = async () => {
    try {
      await signOut()
    } catch (error) {
      Alert.alert('Error signing out', 'Please try again.')
      console.error('Error signing out:', error)
    }
  }

  const toggleEditMode = () => {
    setIsEditing(!isEditing)
  }

  const pickImage = async () => {
    // Check if the module is available
    if (!hasImagePickerSupport) {
      Alert.alert(
        'Feature Not Available',
        'This feature requires a newer version of the app. Please download the latest version from the App Store.',
        [{ text: 'OK' }]
      )
      return
    }

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.5,
        base64: true,
      })

      if (!result.canceled && result.assets && result.assets[0]) {
        const asset = result.assets[0]
        if (asset.base64) {
          await uploadAvatar(asset.base64)
        }
      }
    } catch (error) {
      console.error('Error picking image:', error)
      Alert.alert('Error', 'Failed to select image. Please try again.')
    }
  }

  const takePhoto = async () => {
    // Check if the module is available
    if (!hasImagePickerSupport) {
      Alert.alert(
        'Feature Not Available',
        'This feature requires a newer version of the app. Please download the latest version from the App Store.',
        [{ text: 'OK' }]
      )
      return
    }

    // Request camera permissions
    const { status } = await ImagePicker.requestCameraPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Camera permission is required to take photos.')
      return
    }

    try {
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.5,
        base64: true,
      })

      if (!result.canceled && result.assets && result.assets[0]) {
        const asset = result.assets[0]
        if (asset.base64) {
          await uploadAvatar(asset.base64)
        }
      }
    } catch (error) {
      console.error('Error taking photo:', error)
      Alert.alert('Error', 'Failed to take photo. Please try again.')
    }
  }

  const uploadAvatar = async (base64Image: string) => {
    if (!user || !base64ArrayBuffer) return

    try {
      setUploadingImage(true)
      
      // Generate a unique filename
      const fileName = `avatar-${user.id}-${Date.now()}.jpg`
      const filePath = `avatars/${fileName}`
      
      // Convert base64 to ArrayBuffer for upload
      const contentType = 'image/jpeg'
      const arrayBuffer = base64ArrayBuffer.decode(base64Image)
      
      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('profiles')
        .upload(filePath, arrayBuffer, {
          contentType,
          upsert: true,
        })
        
      if (uploadError) {
        throw uploadError
      }
      
      // Get the public URL
      const { data } = supabase.storage
        .from('profiles')
        .getPublicUrl(filePath)
        
      if (!data || !data.publicUrl) {
        throw new Error('Failed to get public URL for uploaded image')
      }
      
      // Update the avatar URL in the profile
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ 
          avatar_url: data.publicUrl,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id)
        
      if (updateError) {
        throw updateError
      }
      
      // Update local state
      setAvatarUrl(data.publicUrl)
      setProfile(prev => prev ? { ...prev, avatar_url: data.publicUrl } : null)
      
      Alert.alert('Success', 'Profile picture updated!')
      
    } catch (error) {
      console.error('Error uploading avatar:', error)
      Alert.alert('Error', 'Failed to upload image. Please try again.')
    } finally {
      setUploadingImage(false)
    }
  }

  const saveProfile = async () => {
    if (!user) return

    try {
      setSaving(true)
      
      const updates = {
        id: user.id,
        name,
        bio,
        updated_at: new Date().toISOString(),
      }

      const { error } = await supabase
        .from('profiles')
        .upsert(updates)

      if (error) {
        throw error
      }

      // Update local profile state
      setProfile({
        ...profile,
        ...updates
      } as Profile)
      
      setIsEditing(false)
      Alert.alert('Success', 'Profile updated successfully')
    } catch (error) {
      console.error('Error updating profile:', error)
      Alert.alert('Error updating profile', 'Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const showImageOptions = () => {
    // Check if the module is available
    if (!hasImagePickerSupport) {
      Alert.alert(
        'Feature Coming Soon',
        'Profile photo uploads will be available in the next app update.',
        [{ text: 'OK' }]
      )
      return
    }

    Alert.alert(
      'Profile Picture',
      'Update your profile picture',
      [
        { text: 'Take Photo', onPress: takePhoto },
        { text: 'Choose from Library', onPress: pickImage },
        { text: 'Cancel', style: 'cancel' }
      ]
    )
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#6a26cd" />
          <Text style={styles.loadingText}>Loading profile...</Text>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity 
            onPress={showImageOptions}
            disabled={uploadingImage}
            style={styles.avatarContainer}
          >
            {uploadingImage ? (
              <View style={styles.avatarPlaceholder}>
                <ActivityIndicator color="#ffffff" size="large" />
              </View>
            ) : avatarUrl ? (
              <Image 
                source={{ uri: avatarUrl }} 
                style={styles.avatar} 
              />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarText}>
                  {profile?.name?.charAt(0) || user?.email?.charAt(0) || '?'}
                </Text>
              </View>
            )}
            
            <View style={styles.cameraIconContainer}>
              <Ionicons name="camera" size={20} color="#ffffff" />
            </View>
          </TouchableOpacity>
          
          {isEditing ? (
            <TextInput
              style={styles.editableName}
              value={name}
              onChangeText={setName}
              placeholder="Your Name"
              placeholderTextColor="#a4a4ca"
            />
          ) : (
            <Text style={styles.name}>{profile?.name || 'User'}</Text>
          )}
          
          <Text style={styles.email}>{user?.email}</Text>
        </View>

        <View style={styles.infoContainer}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Account ID</Text>
            <Text style={styles.infoValue}>{user?.id}</Text>
          </View>
          
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Bio</Text>
            {isEditing ? (
              <TextInput
                style={styles.editableBio}
                value={bio}
                onChangeText={setBio}
                placeholder="Tell us about yourself..."
                placeholderTextColor="#a4a4ca"
                multiline
              />
            ) : (
              <Text style={styles.infoValue}>
                {profile?.bio || 'No bio yet. Tap Edit to add one.'}
              </Text>
            )}
          </View>
          
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Joined</Text>
            <Text style={styles.infoValue}>
              {profile?.created_at
                ? new Date(profile.created_at).toLocaleDateString()
                : 'N/A'}
            </Text>
          </View>
        </View>

        <View style={styles.buttonContainer}>
          {isEditing ? (
            <>
              <TouchableOpacity 
                style={styles.saveButton} 
                onPress={saveProfile}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <Text style={styles.buttonText}>Save Changes</Text>
                )}
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={styles.cancelButton} 
                onPress={toggleEditMode}
                disabled={saving}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity style={styles.editButton} onPress={toggleEditMode}>
              <Text style={styles.buttonText}>Edit Profile</Text>
            </TouchableOpacity>
          )}
          
          <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
            <Text style={styles.buttonText}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  container: {
    padding: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 30,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 16,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
    borderColor: '#6a26cd',
  },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#6a26cd',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#6a26cd',
  },
  avatarText: {
    fontSize: 40,
    color: '#ffffff',
    fontWeight: 'bold',
  },
  cameraIconContainer: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#6a26cd',
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#1a1a2e',
  },
  name: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#ffffff',
  },
  editableName: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#ffffff',
    borderWidth: 1,
    borderColor: '#6a26cd',
    borderRadius: 8,
    padding: 10,
    width: '80%',
    textAlign: 'center',
    backgroundColor: 'rgba(106, 38, 205, 0.1)',
  },
  email: {
    fontSize: 16,
    color: '#a4a4ca',
  },
  infoContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 10,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#6a26cd',
  },
  infoRow: {
    marginBottom: 16,
  },
  infoLabel: {
    fontSize: 14,
    color: '#a4a4ca',
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 16,
    color: '#ffffff',
  },
  editableBio: {
    fontSize: 16,
    color: '#ffffff',
    borderWidth: 1,
    borderColor: '#6a26cd',
    borderRadius: 8,
    padding: 10,
    minHeight: 100,
    textAlignVertical: 'top',
    backgroundColor: 'rgba(106, 38, 205, 0.1)',
  },
  buttonContainer: {
    marginTop: 20,
  },
  signOutButton: {
    backgroundColor: '#e63946',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 12,
  },
  editButton: {
    backgroundColor: '#6a26cd',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  saveButton: {
    backgroundColor: '#4caf50',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  cancelButton: {
    backgroundColor: 'transparent',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#a4a4ca',
    marginBottom: 12,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  cancelButtonText: {
    color: '#a4a4ca',
    fontSize: 16,
    fontWeight: 'bold',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#ffffff',
  },
}) 