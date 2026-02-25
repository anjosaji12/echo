import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    Truck,
    BarChart3,
    LogOut,
    Package,
    ArrowRight,
    CheckCircle2,
    Clock,
    Activity,
    Zap,
    Layers,
    Cpu,
    Hammer,
    Trash2,
    Leaf,
    Container,
    Navigation,
    User,
    Check,
    Loader2,
    AlertCircle,
    Map as MapIcon,
    Target,
    X,
} from 'lucide-react';

// ── Firebase (shared project, same db as customer portal) ─────────────────────
import { auth } from './firebase/config';
import { onAuthStateChanged } from 'firebase/auth';
import { registerUser, loginUser, logoutUser } from './firebase/authService';
import { saveAgencyProfile, getAgencyProfile } from './firebase/partnerService';
import { subscribeToAllPickups, updatePickupStatus } from './firebase/pickupService';

// ── Waste types (must match customer portal IDs exactly) ─────────────────────
const WASTE_TYPES = {
    plastic: {
        label: 'Plastic',
        icon: Layers,
        color: 'amber',
        theme: 'bg-amber-100 text-amber-700',
        border: 'hover:border-amber-500',
    },
    paper: {
        label: 'Paper/Cardboard',
        icon: Package,
        color: 'slate',
        theme: 'bg-slate-100 text-slate-700',
        border: 'hover:border-slate-500',
    },
    electronic: {
        label: 'E-Waste',
        icon: Cpu,
        color: 'purple',
        theme: 'bg-purple-100 text-purple-700',
        border: 'hover:border-purple-500',
    },
    organic: {
        label: 'Organic',
        icon: Leaf,
        color: 'emerald',
        theme: 'bg-emerald-100 text-emerald-700',
        border: 'hover:border-emerald-500',
    },
    metal: {
        label: 'Metal Waste',
        icon: Container,
        color: 'blue',
        theme: 'bg-blue-100 text-blue-700',
        border: 'hover:border-blue-500',
        subCategories: [
            { id: 'metals_core', label: 'Metals', icon: Hammer, desc: 'Industrial alloys, steel, and aluminum.' },
            { id: 'scraps_mixed', label: 'Scraps', icon: Trash2, desc: 'Mixed demolition and construction scrap.' },
        ],
    },
};

// ── Small helpers ─────────────────────────────────────────────────────────────
const ErrorBanner = ({ message, onDismiss }) => (
    <div className="flex items-center gap-3 bg-red-50 border border-red-200 text-red-700 font-bold text-xs px-4 py-3 rounded-lg">
        <AlertCircle size={16} className="flex-shrink-0" />
        <span className="flex-1">{message}</span>
        {onDismiss && <button onClick={onDismiss}><X size={14} /></button>}
    </div>
);

function friendlyError(code) {
    const m = {
        'auth/email-already-in-use': 'This email is already registered. Try logging in.',
        'auth/invalid-email': 'Please enter a valid email address.',
        'auth/weak-password': 'Password must be at least 6 characters.',
        'auth/user-not-found': 'No account found with this email.',
        'auth/wrong-password': 'Incorrect password. Please try again.',
        'auth/invalid-credential': 'Incorrect email or password.',
        'auth/too-many-requests': 'Too many attempts. Please wait a moment.',
    };
    return m[code] || 'An error occurred. Please try again.';
}

// ── PartnerApp ────────────────────────────────────────────────────────────────
export default function PartnerApp({ onSwitchPortal }) {
    // Auth
    const [firebaseUser, setFirebaseUser] = useState(null);
    const [agencyProfile, setAgencyProfile] = useState(null);
    const [authLoading, setAuthLoading] = useState(true);
    const [authMode, setAuthMode] = useState('login');
    const [authError, setAuthError] = useState('');
    const [authBusy, setAuthBusy] = useState(false);

    // Dashboard
    const [view, setView] = useState('dashboard');
    const [selectedFleet, setSelectedFleet] = useState(null);
    const [tasks, setTasks] = useState([]);
    const [tasksLoading, setTasksLoading] = useState(true);

    // Registration form
    const [reg, setReg] = useState({
        agencyName: '', mobile: '', email: '', gst: '',
        street: '', city: '', pincode: '', state: '', coords: '',
        handledWastes: [],
    });
    const [isLocating, setIsLocating] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Leaflet map
    const [leafletLoaded, setLeafletLoaded] = useState(false);
    const mapContainerRef = useRef(null);
    const mapRef = useRef(null);
    const markerRef = useRef(null);

    // ── Load Leaflet ────────────────────────────────────────────────────────────
    useEffect(() => {
        if (!document.getElementById('leaflet-css')) {
            const link = Object.assign(document.createElement('link'), {
                id: 'leaflet-css', rel: 'stylesheet',
                href: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
            });
            document.head.appendChild(link);
        }
        if (!window.L) {
            const s = Object.assign(document.createElement('script'), {
                src: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
                async: true, onload: () => setLeafletLoaded(true),
            });
            document.head.appendChild(s);
        } else {
            setLeafletLoaded(true);
        }
    }, []);

    // ── Firebase auth listener ──────────────────────────────────────────────────
    useEffect(() => {
        const unsub = onAuthStateChanged(auth, async (fbUser) => {
            setFirebaseUser(fbUser);
            if (fbUser) {
                try {
                    const profile = await getAgencyProfile(fbUser.uid);
                    if (profile) setAgencyProfile(profile);
                } catch (e) { console.error(e); }
            } else {
                setAgencyProfile(null);
            }
            setAuthLoading(false);
        });
        return unsub;
    }, []);

    // ── Subscribe to ALL customer pickups (real-time) ───────────────────────────
    useEffect(() => {
        if (!firebaseUser) return;
        setTasksLoading(true);
        const unsub = subscribeToAllPickups((rawPickups) => {
            // Normalise Firestore pickup docs → task shape for the UI.
            // Customer pickups store wasteTypes as an array — use first item as primary type.
            const mapped = rawPickups.map(p => ({
                id: p.id,
                customerName: p.customerName || 'Customer',
                wasteType: (p.wasteTypes && p.wasteTypes[0]) || 'plastic',
                wasteTypes: p.wasteTypes || [],
                address: p.address || '',
                time: p.time || '',
                date: p.date || '',
                status: p.status || 'pending',
            }));
            setTasks(mapped);
            setTasksLoading(false);
        });
        return unsub;
    }, [firebaseUser]);

    // ── Reverse geocoding ───────────────────────────────────────────────────────
    const reverseGeocode = useCallback(async (lat, lng) => {
        setIsLocating(true);
        try {
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`);
            const data = await res.json();
            if (data?.address) {
                setReg(prev => ({
                    ...prev,
                    street: data.address.road || data.address.suburb || data.display_name.split(',')[0] || '',
                    city: data.address.city || data.address.town || data.address.village || '',
                    state: data.address.state || '',
                    pincode: data.address.postcode || '',
                    coords: `${lat.toFixed(6)}, ${lng.toFixed(6)}`,
                }));
            }
        } catch (e) { console.error(e); }
        finally { setIsLocating(false); }
    }, []);

    // ── Leaflet map init (signup only) ──────────────────────────────────────────
    useEffect(() => {
        if (authMode !== 'signup' || !leafletLoaded || !mapContainerRef.current || mapRef.current) return;
        const timer = setTimeout(() => {
            if (!mapContainerRef.current || mapContainerRef.current._leaflet_id || !window.L) return;
            const L = window.L;
            mapRef.current = L.map(mapContainerRef.current, { zoomControl: false, scrollWheelZoom: false })
                .setView([19.0760, 72.8777], 12);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' })
                .addTo(mapRef.current);
            mapRef.current.on('click', (e) => {
                const { lat, lng } = e.latlng;
                if (markerRef.current) mapRef.current.removeLayer(markerRef.current);
                markerRef.current = L.marker(e.latlng, { draggable: true }).addTo(mapRef.current);
                reverseGeocode(lat, lng);
                markerRef.current.on('dragend', ev => {
                    const p = ev.target.getLatLng();
                    reverseGeocode(p.lat, p.lng);
                });
            });
            mapRef.current.invalidateSize();
        }, 500);
        return () => {
            clearTimeout(timer);
            if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; markerRef.current = null; }
        };
    }, [authMode, leafletLoaded, reverseGeocode]);

    // ── Handlers ────────────────────────────────────────────────────────────────
    const toggleWasteType = (id) =>
        setReg(prev => ({
            ...prev,
            handledWastes: prev.handledWastes.includes(id)
                ? prev.handledWastes.filter(x => x !== id)
                : [...prev.handledWastes, id],
        }));

    const handleAuth = useCallback(async (e) => {
        e.preventDefault();
        setAuthError('');
        setAuthBusy(true);

        const fd = new FormData(e.target);
        const email = fd.get('email');
        const password = fd.get('password');

        try {
            if (authMode === 'signup') {
                if (!reg.agencyName || !reg.coords || reg.handledWastes.length === 0) {
                    setAuthError('Please complete all fields, pin your hub on the map, and select at least one waste type.');
                    return;
                }
                setIsSubmitting(true);
                setIsSubmitting(true);
                const { credential } = await registerUser(email, password, {
                    name: reg.agencyName, phone: reg.mobile, area: reg.city, flatNo: '', street: reg.street,
                });
                await saveAgencyProfile(credential.user.uid, {
                    ...reg, email, registeredAt: new Date().toISOString(),
                });
            } else {
                await loginUser(email, password);
            }
        } catch (err) {
            setAuthError(friendlyError(err.code));
        } finally {
            setAuthBusy(false);
            setIsSubmitting(false);
        }
    }, [authMode, reg]);

    const handleLogout = async () => {
        await logoutUser();
        setAuthMode('login');
        setAuthError('');
        setView('dashboard');
        setSelectedFleet(null);
    };

    // Write status back to Firestore → customer sees update in real-time too
    const updateTaskStatus = async (id, newStatus) => {
        try {
            await updatePickupStatus(id, newStatus);
        } catch (err) {
            console.error('Failed to update pickup status:', err);
        }
    };

    const handleFleetClick = (key) => {
        setSelectedFleet(key);
        setView('tasks');
    };

    const getVisibleWasteTypes = () => {
        const portfolio = agencyProfile?.handledWastes || [];
        if (!portfolio.length) return Object.entries(WASTE_TYPES);
        return Object.entries(WASTE_TYPES).filter(([k]) => portfolio.includes(k));
    };

    // ── Render: Auth loading ────────────────────────────────────────────────────
    if (authLoading) return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center flex-col gap-4">
            <Loader2 className="animate-spin text-emerald-500" size={36} />
            <p className="text-slate-400 font-bold text-sm">Connecting…</p>
        </div>
    );

    // ── Render: Auth ────────────────────────────────────────────────────────────
    if (!firebaseUser) return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 font-sans text-slate-900">
            <div className="w-full max-w-[360px] sm:max-w-[440px] flex flex-col gap-3 animate-in zoom-in-95 duration-500">

                {/* Back to portal selector */}
                {onSwitchPortal && (
                    <button onClick={onSwitchPortal}
                        className="text-left text-[11px] font-bold text-slate-400 hover:text-emerald-600 transition-colors flex items-center gap-1.5 mb-1">
                        <ArrowRight size={12} className="rotate-180" /> Switch to Customer Portal
                    </button>
                )}

                <div className="bg-white border border-slate-200 px-8 py-10 flex flex-col items-center rounded-sm shadow-sm">
                    <div className="flex items-center gap-2 mb-8">
                        <div className="p-1.5 bg-emerald-500 rounded-lg shadow-sm"><Truck className="text-white w-6 h-6" /></div>
                        <span className="text-2xl font-black tracking-tighter uppercase italic">NEX <span className="text-emerald-500">WASTE</span></span>
                    </div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">Partner Agency Portal</p>

                    <form onSubmit={handleAuth} className="w-full flex flex-col gap-2">
                        {authError && <ErrorBanner message={authError} onDismiss={() => setAuthError('')} />}

                        {authMode === 'signup' ? (
                            <div className="flex flex-col gap-2 animate-in fade-in duration-300">
                                <input type="text" placeholder="Agency Name" required
                                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-sm text-xs focus:border-slate-400 outline-none"
                                    value={reg.agencyName} onChange={e => setReg({ ...reg, agencyName: e.target.value })} />
                                <input type="tel" placeholder="Mobile Number (10 Digits)" required maxLength={10}
                                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-sm text-xs focus:border-slate-400 outline-none"
                                    value={reg.mobile} onChange={e => setReg({ ...reg, mobile: e.target.value.replace(/\D/g, '') })} />
                                <input type="text" placeholder="GST Identification Number" required
                                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-sm text-xs focus:border-slate-400 outline-none uppercase"
                                    value={reg.gst} onChange={e => setReg({ ...reg, gst: e.target.value })} />

                                {/* Map pin */}
                                <div className="mt-2 border border-slate-200 rounded-sm overflow-hidden bg-slate-50">
                                    <div className="bg-white border-b border-slate-200 flex items-center justify-between p-2">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                                            <MapIcon size={12} className="text-emerald-500" /> Logistics Hub Pin
                                        </p>
                                        {isLocating && <Loader2 size={12} className="animate-spin text-emerald-500" />}
                                    </div>
                                    <div className="relative">
                                        <div ref={mapContainerRef} style={{ height: '110px' }} className="z-0 grayscale bg-slate-100" />
                                        {!reg.coords && (
                                            <div className="absolute inset-0 bg-black/5 flex items-center justify-center pointer-events-none">
                                                <div className="bg-white/90 shadow-xl px-3 py-1 rounded-full flex items-center gap-2">
                                                    <Target size={12} className="text-red-500 animate-pulse" />
                                                    <span className="text-[8px] font-black text-slate-600 uppercase">Tap to Pin Hub</span>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    <div className="p-3 bg-white border-t border-slate-200 space-y-2 text-[10px]">
                                        <input type="text" placeholder="Street" readOnly value={reg.street}
                                            className="w-full px-2 py-1 bg-slate-50 border-none outline-none" />
                                        <div className="grid grid-cols-2 gap-2">
                                            <input type="text" placeholder="City" readOnly value={reg.city}
                                                className="w-full px-2 py-1 bg-slate-50 border-none outline-none" />
                                            <input type="text" placeholder="Pincode" readOnly value={reg.pincode}
                                                className="w-full px-2 py-1 bg-slate-50 border-none outline-none" />
                                        </div>
                                    </div>
                                </div>

                                {/* Waste portfolio */}
                                <div className="mt-2 mb-1">
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1">Waste Portfolio Managed</p>
                                    <div className="grid grid-cols-2 gap-1.5">
                                        {Object.entries(WASTE_TYPES).map(([id, cfg]) => (
                                            <button key={id} type="button" onClick={() => toggleWasteType(id)}
                                                className={`flex items-center justify-between px-2 py-1.5 rounded-sm border text-[9px] font-bold transition-all ${reg.handledWastes.includes(id)
                                                    ? 'bg-emerald-50 border-emerald-500 text-emerald-700 shadow-sm'
                                                    : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300 shadow-sm'
                                                    }`}>
                                                <span className="truncate">{cfg.label}</span>
                                                {reg.handledWastes.includes(id) && <Check size={10} />}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Corporate email field for signup */}
                                <input type="email" name="email" placeholder="Corporate Email" required
                                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-sm text-xs focus:border-slate-400 outline-none"
                                    value={reg.email} onChange={e => setReg({ ...reg, email: e.target.value })} />
                            </div>
                        ) : (
                            <input name="email" type="email" placeholder="Email address" required
                                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-sm text-xs focus:border-slate-400 outline-none" />
                        )}

                        <input name="password" type="password" placeholder="Password" required minLength={6}
                            className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-sm text-xs focus:border-slate-400 outline-none" />

                        <button type="submit" disabled={authBusy || isLocating}
                            className="w-full mt-4 py-2.5 bg-emerald-500 text-white rounded-md font-bold text-sm hover:bg-emerald-600 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-md">
                            {authBusy ? <Loader2 size={16} className="animate-spin" /> : null}
                            {authMode === 'login' ? 'Log in' : 'Complete Registration'}
                        </button>
                    </form>
                </div>

                <div className="bg-white border border-slate-200 py-6 flex items-center justify-center rounded-sm shadow-sm">
                    <p className="text-sm text-slate-600">
                        {authMode === 'login' ? 'New provider?' : 'Existing agency?'}{' '}
                        <button onClick={() => { setAuthMode(authMode === 'login' ? 'signup' : 'login'); setAuthError(''); }}
                            className="text-emerald-600 font-bold hover:underline">
                            {authMode === 'login' ? 'Sign up' : 'Log in'}
                        </button>
                    </p>
                </div>
            </div>
        </div>
    );

    // ── Render: Dashboard ───────────────────────────────────────────────────────
    const portfolio = agencyProfile?.handledWastes || [];
    const visibleTypes = getVisibleWasteTypes();

    // Filter tasks: must match fleet (if selected), respect portfolio, and only show known waste types
    const filteredTasks = tasks.filter(t => {
        if (!WASTE_TYPES[t.wasteType]) return false;                                        // skip unknown types
        const matchesFleet = !selectedFleet || t.wasteType === selectedFleet;
        const matchesPortfolio = !portfolio.length || portfolio.includes(t.wasteType);
        return matchesFleet && matchesPortfolio;
    });

    return (
        <div className="min-h-screen bg-[#F8FAFC] flex flex-col font-sans">
            {/* Nav */}
            <nav className="flex items-center justify-between px-6 md:px-12 py-4 bg-slate-900 border-b border-slate-800 sticky top-0 z-50">
                <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-emerald-500 rounded-lg"><Truck className="text-white w-5 h-5" /></div>
                    <span className="text-xl font-black text-white tracking-tighter uppercase italic">NEX <span className="text-emerald-500 font-bold">WASTE</span></span>
                </div>
                <div className="flex items-center gap-4">
                    <div className="text-right hidden md:block">
                        <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-1">Center</p>
                        <p className="text-xs font-bold text-white uppercase truncate max-w-[120px]">{agencyProfile?.agencyName || 'HUB-LOGISTICS'}</p>
                    </div>
                    {onSwitchPortal && (
                        <button onClick={onSwitchPortal}
                            className="hidden md:flex items-center gap-1.5 text-[10px] font-black text-slate-400 hover:text-emerald-400 transition-colors uppercase tracking-widest">
                            <ArrowRight size={12} className="rotate-180" /> Customer
                        </button>
                    )}
                    <button onClick={handleLogout}
                        className="p-2.5 bg-slate-800 text-slate-400 hover:text-red-400 rounded-xl transition-colors">
                        <LogOut size={20} />
                    </button>
                </div>
            </nav>

            <div className="max-w-7xl mx-auto p-6 md:p-12 w-full flex-grow">
                {view === 'dashboard' ? (
                    <>
                        {/* Header */}
                        <header className="mb-12 flex flex-col md:flex-row md:items-end justify-between gap-6">
                            <div>
                                <h1 className="text-4xl font-black text-slate-900 tracking-tight leading-none mb-2">Logistics Hub</h1>
                                <p className="text-slate-500 font-semibold italic">
                                    Welcome, {agencyProfile?.agencyName || firebaseUser?.email?.split('@')[0]}. Live updates active.
                                </p>
                            </div>
                            <div className="bg-white px-6 py-4 rounded-[2rem] shadow-sm border border-slate-100 flex items-center gap-4 hover:shadow-md transition-all cursor-pointer">
                                <BarChart3 className="text-emerald-500" size={28} />
                                <div>
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Efficiency</p>
                                    <p className="text-2xl font-black text-slate-900">
                                        {tasks.length === 0 ? '—' : `${Math.round((tasks.filter(t => t.status === 'completed').length / tasks.length) * 100)}%`}
                                    </p>
                                </div>
                            </div>
                        </header>

                        {/* Stats */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
                            {[
                                { label: 'Pending Pickups', val: filteredTasks.filter(t => t.status === 'pending').length, color: 'text-amber-500', icon: Clock },
                                { label: 'In Transit', val: filteredTasks.filter(t => t.status === 'in-progress').length, color: 'text-emerald-600', icon: Activity },
                                { label: 'Completed (24h)', val: filteredTasks.filter(t => t.status === 'completed').length, color: 'text-blue-600', icon: CheckCircle2 },
                            ].map((stat, i) => (
                                <div key={i} className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 border-b-4 hover:border-emerald-500 transition-all">
                                    <div className="flex justify-between items-start mb-2">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{stat.label}</p>
                                        <stat.icon className={`${stat.color} opacity-40`} size={20} />
                                    </div>
                                    <p className={`text-5xl font-black ${stat.color}`}>
                                        {tasksLoading ? <Loader2 size={32} className="animate-spin" /> : stat.val}
                                    </p>
                                </div>
                            ))}
                        </div>

                        {/* Fleet verticals */}
                        <h2 className="text-2xl font-black text-slate-900 mb-8 flex items-center gap-3">
                            <Zap className="text-emerald-500" size={24} /> Registered Fleet Verticals
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
                            {visibleTypes.map(([key, cfg]) => {
                                const activeCount = tasks.filter(t => t.wasteType === key && t.status !== 'completed').length;
                                return (
                                    <div key={key} onClick={() => handleFleetClick(key)}
                                        className={`p-6 bg-white border border-slate-200 rounded-[2rem] ${cfg.border} hover:shadow-2xl transition-all cursor-pointer group relative overflow-hidden flex flex-col`}>
                                        <div className="flex justify-between items-start mb-6">
                                            <div className={`p-3 ${cfg.theme} rounded-2xl w-fit group-hover:rotate-6 transition-transform shadow-sm`}>
                                                <cfg.icon size={24} />
                                            </div>
                                            <div className="text-right">
                                                <span className="text-[10px] font-black text-slate-400 uppercase">Active</span>
                                                <div className="text-lg font-black text-slate-900">{tasksLoading ? '…' : activeCount}</div>
                                            </div>
                                        </div>
                                        <h3 className="text-xl font-black text-slate-900 mb-1">{cfg.label}</h3>
                                        <div className="w-full h-1.5 bg-slate-100 rounded-full mb-6 overflow-hidden">
                                            <div className={`h-full bg-${cfg.color}-500 transition-all duration-1000`}
                                                style={{ width: tasks.length ? `${Math.min(100, (activeCount / Math.max(1, tasks.length)) * 100)}%` : '0%' }} />
                                        </div>
                                        <div className={`mt-auto flex items-center justify-between font-black text-[10px] uppercase tracking-widest text-${cfg.color}-600 group-hover:translate-x-1 transition-transform`}>
                                            <span>Manage Vertical</span><ArrowRight size={14} />
                                        </div>
                                        <div className={`absolute -right-10 -bottom-10 w-24 h-24 bg-${cfg.color}-500/5 rounded-full blur-2xl`} />
                                    </div>
                                );
                            })}
                        </div>
                    </>
                ) : (
                    /* ── Task queue ── */
                    <section className="animate-in slide-in-from-right-8 duration-500">
                        <div className="flex items-center gap-4 mb-10">
                            <button onClick={() => { setView('dashboard'); setSelectedFleet(null); }}
                                className="p-4 bg-white border border-slate-200 rounded-[1.5rem] shadow-sm active:scale-95">
                                <ArrowRight size={20} className="rotate-180" />
                            </button>
                            <div>
                                <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">
                                    {WASTE_TYPES[selectedFleet]?.label || 'All'} Operations
                                </h2>
                                <p className="text-slate-500 font-semibold uppercase text-xs tracking-widest mt-1">Live Routing Control</p>
                            </div>
                        </div>

                        <div className="space-y-6">
                            {tasksLoading ? (
                                <div className="bg-white border border-slate-100 rounded-[3rem] p-24 text-center">
                                    <Loader2 className="mx-auto text-emerald-400 mb-4 animate-spin" size={48} />
                                    <p className="text-slate-400 font-black text-sm uppercase tracking-widest">Loading orders…</p>
                                </div>
                            ) : filteredTasks.length === 0 ? (
                                <div className="bg-white border-4 border-dashed border-slate-100 rounded-[3rem] p-24 text-center">
                                    <Package className="mx-auto text-slate-100 mb-6" size={80} />
                                    <p className="text-slate-400 font-black text-xl italic uppercase tracking-widest">No Active Orders</p>
                                    <p className="text-slate-300 text-sm mt-3">Customer pickups will appear here in real time.</p>
                                </div>
                            ) : (
                                filteredTasks.map(task => (
                                    <div key={task.id}
                                        className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden flex flex-col md:flex-row group hover:shadow-2xl transition-all duration-300">
                                        <div className={`w-3 md:w-5 ${task.status === 'completed' ? 'bg-blue-600' :
                                            task.status === 'in-progress' ? 'bg-emerald-500 animate-pulse' : 'bg-amber-400'
                                            }`} />
                                        <div className="flex-1 p-8 flex flex-col md:flex-row md:items-center gap-12">
                                            <div className="flex-1 space-y-4">
                                                <div className="flex items-center gap-4">
                                                    <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase ${WASTE_TYPES[task.wasteType]?.theme || 'bg-slate-100 text-slate-700'}`}>
                                                        {WASTE_TYPES[task.wasteType]?.label || task.wasteType}
                                                    </span>
                                                    <span className="text-xs text-slate-300 font-black tracking-[0.2em] font-mono">REF: {task.id.slice(0, 8).toUpperCase()}</span>
                                                </div>
                                                <div>
                                                    <h3 className="text-3xl font-black text-slate-900 tracking-tight group-hover:text-emerald-600 transition-colors">
                                                        {task.address || 'Unknown Location'}
                                                    </h3>
                                                    <p className="text-sm text-slate-500 font-bold mt-1">
                                                        Client: <span className="text-slate-900">{task.customerName}</span>
                                                    </p>
                                                </div>
                                                <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest border-l-2 border-slate-200 pl-3">
                                                    <Clock size={16} className="text-slate-200" />
                                                    <span>{task.date ? `${task.date} · ` : ''}{task.time || 'ASAP'}</span>
                                                </div>
                                            </div>
                                            <div className="flex flex-col gap-3 min-w-[240px]">
                                                {task.status === 'pending' &&
                                                    <button onClick={() => updateTaskStatus(task.id, 'in-progress')}
                                                        className="w-full py-5 bg-slate-900 text-white font-black rounded-2xl hover:bg-emerald-600 transition-all uppercase text-[10px] tracking-widest flex items-center justify-center gap-2 active:scale-95 shadow-xl shadow-slate-200">
                                                        <Truck size={16} /> Accept Order
                                                    </button>}
                                                {task.status === 'in-progress' &&
                                                    <button onClick={() => updateTaskStatus(task.id, 'completed')}
                                                        className="w-full py-5 bg-emerald-600 text-white font-black rounded-2xl hover:bg-emerald-700 transition-all flex items-center justify-center gap-2 uppercase text-[10px] tracking-widest active:scale-95 shadow-xl shadow-emerald-200">
                                                        <CheckCircle2 size={18} /> Confirm Handover
                                                    </button>}
                                                {task.status === 'completed' &&
                                                    <div className="w-full py-5 bg-slate-50 text-slate-300 font-black rounded-2xl text-center flex items-center justify-center gap-2 text-[10px] tracking-widest uppercase border border-slate-100 italic">
                                                        <CheckCircle2 size={18} /> Logged
                                                    </div>}
                                                <button className="w-full py-4 border-2 border-slate-100 text-slate-400 font-black rounded-2xl hover:bg-slate-50 hover:border-slate-300 transition-all text-[10px] flex items-center justify-center gap-2 uppercase tracking-widest">
                                                    <Navigation size={18} /> Track
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </section>
                )}
            </div>
        </div>
    );
}
