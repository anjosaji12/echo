import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  User,
  Calendar,
  LogOut,
  Package,
  Mail,
  Lock,
  Leaf,
  ArrowRight,
  Trash2,
  Clock,
  Phone,
  CheckCircle2,
  MapPin,
  TrendingUp,
  Award,
  ShieldCheck,
  Home,
  Edit2,
  RefreshCw,
  ChevronDown,
  X,
  Loader2,
  AlertCircle,
} from 'lucide-react';

// Firebase
import { auth } from './firebase/config';
import { onAuthStateChanged } from 'firebase/auth';
import { registerUser, loginUser, logoutUser } from './firebase/authService';
import { addPickup, subscribeToPickups, deletePickup } from './firebase/pickupService';
import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase/config';

// ─── Configuration ────────────────────────────────────────────────────────────
const WASTE_TYPES = [
  { id: 'plastic', label: 'Plastic', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  { id: 'paper', label: 'Paper/Cardboard', color: 'bg-amber-100 text-amber-700 border-amber-200' },
  { id: 'electronic', label: 'E-Waste', color: 'bg-purple-100 text-purple-700 border-purple-200' },
  { id: 'organic', label: 'Organic', color: 'bg-green-100 text-green-700 border-green-200' },
  { id: 'metal', label: 'Metal', color: 'bg-slate-100 text-slate-700 border-slate-200' },
];

const TIME_SLOTS = [
  '9:00 AM - 11:00 AM',
  '11:00 AM - 1:00 PM',
  '1:00 PM - 3:00 PM',
  '3:00 PM - 5:00 PM',
];

const SERVICE_AREAS = [
  'Downtown Eco-District',
  'Green Valley Residential',
  'North Industrial Park',
  'Sunset Bay Waterfront',
  'Central Heights',
  'Western Suburbs',
  'East Riverside',
];

// ─── Small helpers ─────────────────────────────────────────────────────────────
/** Loading spinner overlay */
const Spinner = ({ label = 'Loading…' }) => (
  <div className="min-h-screen bg-[#F8FAF9] flex flex-col items-center justify-center gap-4">
    <Loader2 className="animate-spin text-emerald-600" size={40} />
    <p className="text-gray-400 font-bold">{label}</p>
  </div>
);

/** Inline error banner */
const ErrorBanner = ({ message, onDismiss }) => (
  <div className="flex items-center gap-3 bg-red-50 border border-red-200 text-red-700 font-bold text-sm px-4 py-3 rounded-2xl animate-in fade-in duration-300">
    <AlertCircle size={18} className="flex-shrink-0" />
    <span className="flex-1">{message}</span>
    {onDismiss && (
      <button onClick={onDismiss} className="hover:text-red-900 transition-colors">
        <X size={16} />
      </button>
    )}
  </div>
);

// ─── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  // ── Auth state ──────────────────────────────────
  const [firebaseUser, setFirebaseUser] = useState(null);   // raw Firebase user
  const [userProfile, setUserProfile] = useState(null);   // Firestore profile doc
  const [authLoading, setAuthLoading] = useState(true);   // waiting for onAuthStateChanged

  // ── Auth form state ─────────────────────────────
  const [authMode, setAuthMode] = useState('login');
  const [authError, setAuthError] = useState('');
  const [authBusy, setAuthBusy] = useState(false);

  // ── Dashboard form state ────────────────────────
  const [selectedTypes, setSelectedTypes] = useState([]);
  const [isEditingAddress, setIsEditingAddress] = useState(false);
  const [customAddress, setCustomAddress] = useState('');
  const [selectedTimeSlot, setSelectedTimeSlot] = useState(TIME_SLOTS[0]);
  const [isWasteDropdownOpen, setIsWasteDropdownOpen] = useState(false);
  const [bookingBusy, setBookingBusy] = useState(false);
  const [bookingError, setBookingError] = useState('');
  const wasteDropdownRef = useRef(null);

  // ── Pickups state ────────────────────────────────
  const [pickups, setPickups] = useState([]);

  // ─── Listen to Firebase Auth changes ──────────────────────────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);

      if (fbUser) {
        // Load Firestore profile
        try {
          const snap = await getDoc(doc(db, 'users', fbUser.uid));
          if (snap.exists()) {
            setUserProfile(snap.data());
          } else {
            // Fallback: construct minimal profile from Firebase Auth data
            setUserProfile({
              uid: fbUser.uid,
              name: fbUser.displayName || fbUser.email?.split('@')[0] || 'User',
              email: fbUser.email || '',
              fullAddress: '',
              area: '',
            });
          }
        } catch (err) {
          console.error('Error loading user profile:', err);
        }
      } else {
        setUserProfile(null);
        setPickups([]);
      }

      setAuthLoading(false);
    });
    return unsub;
  }, []);

  // ─── Subscribe to this user's pickups in real-time ────────────────────────
  useEffect(() => {
    if (!firebaseUser) return;
    const unsub = subscribeToPickups(firebaseUser.uid, (data) => setPickups(data));
    return unsub;
  }, [firebaseUser]);

  // ─── Close waste dropdown on outside click ────────────────────────────────
  useEffect(() => {
    function handleClickOutside(event) {
      if (wasteDropdownRef.current && !wasteDropdownRef.current.contains(event.target)) {
        setIsWasteDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ─── Handlers ─────────────────────────────────────────────────────────────
  const toggleWasteType = (id) => {
    setSelectedTypes(prev =>
      prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]
    );
  };

  const removeWasteType = (e, id) => {
    e.stopPropagation();
    setSelectedTypes(prev => prev.filter(t => t !== id));
  };

  /** Handle Login / Signup form submission */
  const handleAuth = useCallback(async (e) => {
    e.preventDefault();
    setAuthError('');
    setAuthBusy(true);

    const formData = new FormData(e.target);
    const email = formData.get('email');
    const password = formData.get('password');

    try {
      if (authMode === 'signup') {
        await registerUser(email, password, {
          name: formData.get('name') || email.split('@')[0],
          phone: formData.get('phone'),
          area: formData.get('area'),
          flatNo: formData.get('flatNo'),
          street: formData.get('street'),
        });
      } else {
        await loginUser(email, password);
      }
      // onAuthStateChanged will update state automatically
    } catch (err) {
      setAuthError(friendlyAuthError(err.code));
    } finally {
      setAuthBusy(false);
    }
  }, [authMode]);

  /** Handle scheduling a new pickup */
  const handleBooking = useCallback(async (e) => {
    e.preventDefault();
    if (selectedTypes.length === 0 || !firebaseUser) return;

    const formData = new FormData(e.target);
    const dateValue = formData.get('date');
    if (!dateValue) return;

    const address = isEditingAddress
      ? (customAddress || userProfile?.fullAddress || '')
      : (userProfile?.fullAddress || '');

    setBookingBusy(true);
    setBookingError('');

    try {
      await addPickup(firebaseUser.uid, {
        wasteTypes: [...selectedTypes],
        address,
        date: dateValue,
        time: selectedTimeSlot,
      });

      // Reset form
      e.target.reset();
      setSelectedTypes([]);
      setIsEditingAddress(false);
      setCustomAddress('');
    } catch (err) {
      console.error('Booking error:', err);
      setBookingError('Could not schedule pickup. Please try again.');
    } finally {
      setBookingBusy(false);
    }
  }, [selectedTypes, firebaseUser, isEditingAddress, customAddress, userProfile, selectedTimeSlot]);

  /** Delete a pickup */
  const handleDeletePickup = useCallback(async (pickupId) => {
    try {
      await deletePickup(pickupId);
    } catch (err) {
      console.error('Delete error:', err);
    }
  }, []);

  const handleLogout = async () => {
    await logoutUser();
    setAuthMode('login');
    setAuthError('');
    setIsEditingAddress(false);
    setSelectedTypes([]);
    setCustomAddress('');
  };

  const toggleAddressEdit = () => {
    if (isEditingAddress) {
      setIsEditingAddress(false);
      setCustomAddress('');
    } else {
      setIsEditingAddress(true);
      setCustomAddress('');
    }
  };

  // ─── Map Firebase error codes to friendly messages ────────────────────────
  function friendlyAuthError(code) {
    const map = {
      'auth/email-already-in-use': 'This email is already registered. Try logging in.',
      'auth/invalid-email': 'Please enter a valid email address.',
      'auth/weak-password': 'Password must be at least 6 characters.',
      'auth/user-not-found': 'No account found with this email.',
      'auth/wrong-password': 'Incorrect password. Please try again.',
      'auth/invalid-credential': 'Incorrect email or password. Please try again.',
      'auth/too-many-requests': 'Too many attempts. Please wait a moment.',
      'auth/network-request-failed': 'Network error. Check your connection.',
    };
    return map[code] || 'An unexpected error occurred. Please try again.';
  }

  // ─── Render: Loading ──────────────────────────────────────────────────────
  if (authLoading) return <Spinner label="Connecting…" />;

  // ─── Render: Auth Page ────────────────────────────────────────────────────
  const AuthHome = () => (
    <div className="min-h-screen bg-[#F8FAF9] flex items-center justify-center p-6 py-12">
      <div className="w-full max-w-md animate-in zoom-in-95 duration-500">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center p-3 bg-emerald-600 rounded-2xl mb-4 shadow-lg shadow-emerald-100">
            <Leaf className="text-white w-8 h-8" />
          </div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tighter uppercase mb-1">EcoCollect</h1>
          <h2 className="text-xl font-bold text-gray-600">
            {authMode === 'login' ? 'Welcome Back' : 'Create Account'}
          </h2>
        </div>

        <div className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-emerald-50">
          <form onSubmit={handleAuth} className="space-y-4">

            {/* Error banner */}
            {authError && (
              <ErrorBanner message={authError} onDismiss={() => setAuthError('')} />
            )}

            {authMode === 'signup' && (
              <div className="relative group">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-emerald-500 transition-colors" size={20} />
                <input
                  name="name"
                  type="text"
                  placeholder="Full Name"
                  required
                  className="w-full pl-12 pr-4 py-4 bg-gray-50 border-2 border-transparent rounded-2xl focus:border-emerald-500 focus:bg-white outline-none font-bold transition-all shadow-sm"
                />
              </div>
            )}

            <div className="relative group">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-emerald-500 transition-colors" size={20} />
              <input
                name="email"
                type="email"
                placeholder="Email Address"
                required
                className="w-full pl-12 pr-4 py-4 bg-gray-50 border-2 border-transparent rounded-2xl focus:border-emerald-500 focus:bg-white outline-none font-bold transition-all shadow-sm"
              />
            </div>

            {authMode === 'signup' && (
              <>
                <div className="relative group">
                  <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-emerald-500 transition-colors" size={20} />
                  <input
                    name="phone"
                    type="tel"
                    placeholder="Phone Number"
                    required
                    className="w-full pl-12 pr-4 py-4 bg-gray-50 border-2 border-transparent rounded-2xl focus:border-emerald-500 focus:bg-white outline-none font-bold transition-all shadow-sm"
                  />
                </div>

                <div className="pt-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 mb-2 block">Registration Address</label>
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div className="relative group">
                      <Home className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-emerald-500 transition-colors" size={18} />
                      <input
                        name="flatNo"
                        type="text"
                        placeholder="Flat/House #"
                        required
                        className="w-full pl-11 pr-4 py-4 bg-gray-50 border-2 border-transparent rounded-2xl focus:border-emerald-500 focus:bg-white outline-none font-bold transition-all shadow-sm text-sm"
                      />
                    </div>
                    <div className="relative group">
                      <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-emerald-500 transition-colors" size={18} />
                      <select
                        name="area"
                        required
                        defaultValue=""
                        className="w-full pl-11 pr-4 py-4 rounded-2xl bg-gray-50 border-2 border-transparent focus:border-emerald-500 focus:bg-white outline-none font-bold transition-all cursor-pointer text-sm appearance-none shadow-sm"
                      >
                        <option value="" disabled>Area</option>
                        {SERVICE_AREAS.map(area => (
                          <option key={area} value={area}>{area}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="relative group">
                    <input
                      name="street"
                      type="text"
                      placeholder="Street Name / Landmark"
                      className="w-full px-5 py-4 bg-gray-50 border-2 border-transparent rounded-2xl focus:border-emerald-500 focus:bg-white outline-none font-bold transition-all shadow-sm text-sm"
                    />
                  </div>
                </div>
              </>
            )}

            <div className="relative group pt-2">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-emerald-500 transition-colors" size={20} />
              <input
                name="password"
                type="password"
                placeholder="Password"
                required
                minLength={6}
                className="w-full pl-12 pr-4 py-4 bg-gray-50 border-2 border-transparent rounded-2xl focus:border-emerald-500 focus:bg-white outline-none font-bold transition-all shadow-sm"
              />
            </div>

            <button
              type="submit"
              disabled={authBusy}
              className="w-full py-5 bg-emerald-600 text-white rounded-2xl font-black text-lg hover:bg-emerald-700 disabled:bg-emerald-400 transition-all shadow-xl shadow-emerald-100 flex items-center justify-center gap-3 uppercase tracking-widest active:scale-95 mt-4"
            >
              {authBusy ? (
                <Loader2 className="animate-spin" size={22} />
              ) : (
                <>{authMode === 'login' ? 'Sign In' : 'Register Account'} <ArrowRight size={20} /></>
              )}
            </button>
          </form>

          <div className="mt-8 text-center border-t border-gray-50 pt-6">
            <p className="text-gray-500 font-bold text-sm">
              {authMode === 'login' ? "Don't have an account?" : 'Already have an account?'}
              <button
                onClick={() => { setAuthMode(authMode === 'login' ? 'signup' : 'login'); setAuthError(''); }}
                className="ml-2 text-emerald-600 hover:underline decoration-2 underline-offset-4"
              >
                {authMode === 'login' ? 'Register Now' : 'Login'}
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  // ─── Render: Dashboard ────────────────────────────────────────────────────
  const DashboardView = () => (
    <div className="min-h-screen bg-[#F8FAF9]">
      <nav className="flex items-center justify-between px-6 py-4 bg-white border-b border-emerald-50 sticky top-0 z-50">
        <div className="flex items-center gap-2 cursor-pointer group">
          <div className="p-1.5 bg-emerald-600 rounded-lg group-hover:rotate-12 transition-transform flex items-center justify-center">
            <Leaf className="text-white w-5 h-5" />
          </div>
          <span className="text-xl font-black text-gray-900 tracking-tighter">EcoCollect</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex flex-col items-end">
            <span className="text-sm font-bold text-gray-700 hidden sm:block">{userProfile?.name}</span>
            <span className="text-[10px] text-gray-400 font-medium">{userProfile?.area || userProfile?.email}</span>
          </div>
          <button
            onClick={handleLogout}
            className="p-2.5 bg-gray-50 text-gray-400 hover:text-red-500 rounded-xl transition-colors flex items-center justify-center"
          >
            <LogOut size={20} />
          </button>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto p-6 md:p-10 animate-in fade-in duration-500">
        <header className="mb-10 text-center md:text-left">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div>
              <h1 className="text-4xl font-black text-gray-900 tracking-tight">Recycling Hub</h1>
              <p className="text-gray-500 font-medium text-lg">Ready for another cleanup, {userProfile?.name}?</p>
            </div>
            <div className="flex gap-4 justify-center md:justify-end">
              <div className="bg-white px-6 py-4 rounded-3xl shadow-sm border border-emerald-50 flex items-center gap-4">
                <div className="p-3 bg-emerald-100 rounded-2xl text-emerald-600">
                  <TrendingUp size={24} />
                </div>
                <div>
                  <div className="text-2xl font-black text-gray-900">{pickups.length}</div>
                  <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Pickups</div>
                </div>
              </div>
              <div className="bg-white px-6 py-4 rounded-3xl shadow-sm border border-emerald-50 flex items-center gap-4">
                <div className="p-3 bg-amber-100 rounded-2xl text-amber-600">
                  <Award size={24} />
                </div>
                <div>
                  <div className="text-2xl font-black text-gray-900">Gold</div>
                  <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Impact</div>
                </div>
              </div>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          {/* ── Booking Form ───────────────────────────────────────── */}
          <section className="lg:col-span-4">
            <div className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-emerald-50 sticky top-28">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-black flex items-center gap-3 tracking-tighter">
                  <Calendar className="text-emerald-500" /> NEW PICKUP
                </h2>
                <div className="p-2 bg-emerald-50 rounded-xl">
                  <ShieldCheck className="text-emerald-600" size={20} />
                </div>
              </div>

              {bookingError && (
                <div className="mb-4">
                  <ErrorBanner message={bookingError} onDismiss={() => setBookingError('')} />
                </div>
              )}

              <form onSubmit={handleBooking} className="space-y-5">
                {/* Waste Type Dropdown */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Waste Types</label>
                  <div className="relative" ref={wasteDropdownRef}>
                    <button
                      type="button"
                      onClick={() => setIsWasteDropdownOpen(!isWasteDropdownOpen)}
                      className="w-full min-h-[56px] px-4 py-3 rounded-xl bg-gray-50 border-2 border-transparent hover:border-emerald-200 transition-all flex items-center justify-between gap-2"
                    >
                      <div className="flex flex-wrap gap-1.5 overflow-hidden">
                        {selectedTypes.length === 0 ? (
                          <span className="text-gray-400 font-bold text-sm">Select categories...</span>
                        ) : (
                          selectedTypes.map(typeId => {
                            const type = WASTE_TYPES.find(t => t.id === typeId);
                            return (
                              <span
                                key={typeId}
                                className="inline-flex items-center gap-1.5 px-2 py-1 bg-emerald-600 text-white rounded-lg text-[10px] font-black uppercase whitespace-nowrap animate-in zoom-in-95"
                              >
                                {type?.label}
                                <X
                                  size={12}
                                  className="cursor-pointer hover:bg-emerald-500 rounded"
                                  onClick={(e) => removeWasteType(e, typeId)}
                                />
                              </span>
                            );
                          })
                        )}
                      </div>
                      <ChevronDown
                        size={18}
                        className={`text-gray-400 transition-transform ${isWasteDropdownOpen ? 'rotate-180' : ''}`}
                      />
                    </button>

                    {isWasteDropdownOpen && (
                      <div className="absolute top-full left-0 w-full mt-2 bg-white border border-emerald-50 rounded-2xl shadow-2xl z-[60] overflow-hidden animate-in slide-in-from-top-2 duration-200">
                        <div className="max-h-60 overflow-y-auto p-2">
                          {WASTE_TYPES.map(type => (
                            <button
                              key={type.id}
                              type="button"
                              onClick={() => toggleWasteType(type.id)}
                              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all mb-1 ${selectedTypes.includes(type.id)
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : 'hover:bg-gray-50 text-gray-600'
                                }`}
                            >
                              <div className="flex items-center gap-3">
                                <div className={`w-3 h-3 rounded-full ${type.id === 'plastic' ? 'bg-emerald-500' :
                                    type.id === 'paper' ? 'bg-amber-500' :
                                      type.id === 'electronic' ? 'bg-purple-500' :
                                        type.id === 'organic' ? 'bg-green-500' : 'bg-slate-500'
                                  }`} />
                                <span className="font-bold text-sm">{type.label}</span>
                              </div>
                              {selectedTypes.includes(type.id) && <CheckCircle2 size={16} className="text-emerald-600" />}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Location */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between ml-1 mb-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Location</label>
                    <button
                      type="button"
                      onClick={toggleAddressEdit}
                      className="text-[10px] font-black text-emerald-600 uppercase flex items-center gap-1 hover:text-emerald-700 transition-colors"
                    >
                      {isEditingAddress ? <><RefreshCw size={10} /> Reset</> : <><Edit2 size={10} /> Change</>}
                    </button>
                  </div>

                  <div className={`relative group transition-all duration-300 ${isEditingAddress ? 'ring-2 ring-emerald-100 rounded-xl' : ''}`}>
                    <Home
                      className={`absolute left-4 top-1/2 -translate-y-1/2 transition-colors ${isEditingAddress ? 'text-emerald-500' : 'text-gray-400'}`}
                      size={18}
                    />
                    <input
                      name="address"
                      required
                      value={isEditingAddress ? customAddress : (userProfile?.fullAddress || '')}
                      onChange={(e) => setCustomAddress(e.target.value)}
                      readOnly={!isEditingAddress}
                      placeholder={isEditingAddress ? 'Type custom address…' : 'Enter pickup address'}
                      className={`w-full pl-11 pr-4 py-4 rounded-xl font-bold outline-none text-sm transition-all ${isEditingAddress
                          ? 'bg-white border-emerald-500 border-2 shadow-inner placeholder:text-gray-300'
                          : 'bg-gray-100 border-transparent border-2 text-gray-500'
                        }`}
                    />
                  </div>
                </div>

                {/* Date & Time */}
                <div className="grid grid-cols-1 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Date</label>
                    <input
                      name="date"
                      type="date"
                      required
                      className="w-full px-4 py-4 rounded-xl bg-gray-50 border-none focus:ring-2 focus:ring-emerald-500 font-bold text-sm outline-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Time Slot</label>
                    <div className="relative group">
                      <Clock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-emerald-500" size={18} />
                      <select
                        value={selectedTimeSlot}
                        onChange={(e) => setSelectedTimeSlot(e.target.value)}
                        className="w-full pl-11 pr-4 py-4 rounded-xl bg-gray-50 border-none focus:ring-2 focus:ring-emerald-500 font-bold text-sm outline-none appearance-none cursor-pointer"
                      >
                        {TIME_SLOTS.map(slot => (
                          <option key={slot} value={slot}>{slot}</option>
                        ))}
                      </select>
                      <ChevronDown size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={selectedTypes.length === 0 || bookingBusy}
                  className={`w-full py-5 rounded-2xl font-black shadow-lg transition-all uppercase tracking-[0.2em] text-xs flex items-center justify-center gap-2 ${selectedTypes.length > 0 && !bookingBusy
                      ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                      : 'bg-gray-200 text-gray-400 cursor-not-allowed shadow-none'
                    }`}
                >
                  {bookingBusy ? <Loader2 className="animate-spin" size={18} /> : 'Schedule Pickup'}
                </button>
              </form>
            </div>
          </section>

          {/* ── Pickups List ────────────────────────────────────────── */}
          <section className="lg:col-span-8">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-2xl font-black text-gray-900 uppercase tracking-tighter">My Schedule</h2>
              <span className="bg-white border px-3 py-1 rounded-full text-[10px] font-black text-gray-400 uppercase">
                {pickups.length} Bookings
              </span>
            </div>

            <div className="space-y-4">
              {pickups.length === 0 ? (
                <div className="bg-white border-2 border-dashed border-emerald-50 rounded-[2.5rem] p-24 text-center">
                  <Package className="mx-auto text-emerald-100 mb-6" size={64} />
                  <p className="text-gray-400 font-bold text-lg">Your schedule is empty.</p>
                  <p className="text-gray-300 text-sm">Start your recycling journey today!</p>
                </div>
              ) : (
                pickups.map(pickup => (
                  <div
                    key={pickup.id}
                    className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-emerald-50 flex flex-col sm:flex-row justify-between items-center group hover:shadow-xl transition-all hover:border-emerald-300"
                  >
                    <div className="flex items-start gap-6 w-full">
                      <div className="p-5 bg-emerald-50 rounded-2xl group-hover:rotate-6 transition-transform flex items-center justify-center flex-shrink-0">
                        <Package className="text-emerald-500" size={28} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap gap-2 mb-3">
                          {pickup.wasteTypes.map(typeId => {
                            const typeObj = WASTE_TYPES.find(t => t.id === typeId);
                            return (
                              <span
                                key={typeId}
                                className={`px-2.5 py-1 rounded text-[10px] font-black uppercase border-b-2 ${typeObj?.color || 'bg-gray-100 text-gray-600'}`}
                              >
                                {typeObj?.label || typeId}
                              </span>
                            );
                          })}
                        </div>
                        <h3 className="text-xl font-black text-gray-900 mb-2 truncate flex items-center gap-2">
                          <MapPin size={18} className="text-emerald-600 flex-shrink-0" />
                          {pickup.address}
                        </h3>
                        <div className="flex items-center gap-4 text-xs font-bold text-gray-400">
                          <span className="flex items-center gap-1.5"><Calendar size={14} /> {pickup.date}</span>
                          <span className="flex items-center gap-1.5 text-emerald-600 font-black"><Clock size={14} /> {pickup.time}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 mt-6 sm:mt-0 flex-shrink-0 w-full sm:w-auto border-t sm:border-t-0 pt-4 sm:pt-0">
                      <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${pickup.status === 'completed' ? 'bg-emerald-500 text-white' : 'bg-amber-400 text-white shadow-sm'
                        }`}>
                        {pickup.status}
                      </span>
                      {pickup.status === 'pending' && (
                        <button
                          onClick={() => handleDeletePickup(pickup.id)}
                          className="p-2.5 bg-gray-50 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all flex items-center justify-center"
                        >
                          <Trash2 size={20} />
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );

  // ─── Root render ──────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen font-sans selection:bg-emerald-100">
      {!firebaseUser ? <AuthHome /> : <DashboardView />}
    </div>
  );
}