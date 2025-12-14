// src/components/JobPostingForm.js
import React, { useState, useEffect, useMemo, useCallback, useId, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { auth } from '../firebase';
import { signInWithEmailAndPassword, signOut } from "firebase/auth";

// Axios instance for consistent API calls
const api = axios.create({
    baseURL: process.env.REACT_APP_API_BASE_URL || 'http://localhost:8000'
});

// A custom hook for debouncing
const useDebounce = (value, delay) => {
    const [debouncedValue, setDebouncedValue] = useState(value);
    useEffect(() => {
        const handler = setTimeout(() => setDebouncedValue(value), delay);
        return () => clearTimeout(handler);
    }, [value, delay]);
    return debouncedValue;
};

// --- Helper Components ---

const visuallyHiddenStyle = {
    border: 0,
    clip: 'rect(0 0 0 0)',
    height: '1px',
    margin: '-1px',
    overflow: 'hidden',
    padding: 0,
    position: 'absolute',
    width: '1px',
};

const VisuallyHiddenLabel = ({ htmlFor, children }) => (
    <label htmlFor={htmlFor} style={visuallyHiddenStyle}>{children}</label>
);

const GeminiInspiredIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ marginRight: '6px' }}>
        <path d="M12 2L13.66 8.34L20 10L13.66 11.66L12 18L10.34 11.66L4 10L10.34 8.34L12 2Z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M12 2V5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M12 18V21" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M4 10H7" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M17 10H20" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
);


const Calendar = ({ selectedDate, onDateSelect, onClose }) => {
    const [date, setDate] = useState(new Date());
    const calendarRef = useRef(null);

    useEffect(() => {
        if (selectedDate) {
            setDate(new Date(selectedDate.replace(/-/g, '/')));
        } else {
            setDate(new Date());
        }
    }, [selectedDate]);


    // SVG Icons for navigation buttons
    const ChevronLeftIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>);
    const ChevronRightIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (calendarRef.current && !calendarRef.current.contains(event.target)) {
                onClose();
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [onClose]);

    const daysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
    const firstDayOfMonth = (year, month) => new Date(year, month, 1).getDay();

    const changeMonth = (offset) => {
        setDate(prevDate => {
            const newDate = new Date(prevDate);
            newDate.setMonth(newDate.getMonth() + offset);
            return newDate;
        });
    };

    const handleDayClick = (day) => {
        const newDate = new Date(date.getFullYear(), date.getMonth(), day);
        const formattedDate = newDate.toISOString().split('T')[0];
        onDateSelect(formattedDate);
    };

    const renderDays = () => {
        const year = date.getFullYear();
        const month = date.getMonth();
        const totalDays = daysInMonth(year, month);
        const firstDay = firstDayOfMonth(year, month);
        const today = new Date();
        const selected = selectedDate ? new Date(selectedDate.replace(/-/g, '/')) : null;

        let days = [];
        for (let i = 0; i < firstDay; i++) {
            days.push(<div key={`empty-${i}`} style={{ width: 'calc(100% / 7)', height: '40px' }}></div>);
        }

        for (let day = 1; day <= totalDays; day++) {
            const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;
            const isSelected = selected && selected.getFullYear() === year && selected.getMonth() === month && selected.getDate() === day;

            const dayStyle = {
                width: 'calc(100% / 7)',
                height: '40px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                borderRadius: '50%',
                transition: 'background-color 0.2s ease, color 0.2s ease',
                backgroundColor: isSelected ? 'var(--taskio-orange, #FF9100)' : 'transparent',
                color: isSelected ? 'white' : 'inherit',
                fontWeight: isToday ? 'bold' : 'normal',
                border: isToday && !isSelected ? '1px solid var(--taskio-teal, #14C5C5)' : 'none',
            };

            days.push(
                <div key={day} style={dayStyle} onClick={() => handleDayClick(day)} onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.backgroundColor = '#f0f0f0'; }} onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent'; }}>
                    {day}
                </div>
            );
        }
        return days;
    };
    
    const calendarStyle = { position: 'absolute', zIndex: 10, backgroundColor: 'white', border: '1px solid #e0e0e0', borderRadius: '12px', padding: '16px', boxShadow: '0 8px 16px rgba(0,0,0,0.1)', marginTop: '8px', width: '300px', fontFamily: 'sans-serif' };
    const headerStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', padding: '0 4px' };
    const monthYearStyle = { fontWeight: '600', fontSize: '16px' };
    const buttonStyle = { background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555' };
    const gridStyle = { display: 'flex', flexWrap: 'wrap' };
    const dayHeaderStyle = { width: 'calc(100% / 7)', textAlign: 'center', fontWeight: '600', color: '#999', fontSize: '12px', paddingBottom: '12px' };

    return (
        <div ref={calendarRef} style={calendarStyle}>
            <div style={headerStyle}>
                <button onClick={() => changeMonth(-1)} style={buttonStyle}><ChevronLeftIcon /></button>
                <span style={monthYearStyle}>{date.toLocaleString('default', { month: 'long', year: 'numeric' })}</span>
                <button onClick={() => changeMonth(1)} style={buttonStyle}><ChevronRightIcon /></button>
            </div>
            <div style={gridStyle}>
                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(day => <div key={day} style={dayHeaderStyle}>{day}</div>)}
                {renderDays()}
            </div>
        </div>
    );
};


const TaskSummary = ({ formData }) => {
    const summaryStyle = { padding: '20px', border: '1px solid var(--light-grey, #E0E0E0)', borderRadius: '8px', backgroundColor: 'var(--white, #FFFFFF)', minWidth: '300px', height: 'fit-content' };
    const headingStyle = { fontFamily: 'Poppins, sans-serif', color: 'var(--charcoal, #222222)', borderBottom: '1px solid var(--light-grey, #E0E0E0)', paddingBottom: '10px', marginBottom: '15px' };
    const itemStyle = { marginBottom: '15px' };
    const labelStyle = { fontWeight: 'bold', display: 'block', marginBottom: '4px', fontSize: '14px' };
    const valueStyle = { fontSize: '14px', color: '#555' };
    return (
        <div style={summaryStyle}>
            <h3 style={headingStyle}>Task Summary</h3>
            <div style={itemStyle}><span style={labelStyle}>Title:</span><span style={valueStyle}>{formData.title || 'Not specified'}</span></div>
            <div style={itemStyle}><span style={labelStyle}>Timeline:</span><span style={valueStyle}>{(formData.timeline === 'On a specific date' ? formData.specificDate : formData.timeline) || 'Not specified'}</span></div>
            <div style={itemStyle}><span style={labelStyle}>Budget:</span><span style={valueStyle}>{formData.budget || 'Not specified'}</span></div>
            <div style={itemStyle}><span style={labelStyle}>Location:</span><span style={valueStyle}>{formData.location || 'Not specified'}</span></div>
        </div>
    );
};

const PasswordStrengthMeter = ({ password }) => {
    const criteria = useMemo(() => [
        { label: "At least 8 characters", regex: /.{8,}/ },
        { label: "An uppercase letter", regex: /[A-Z]/ },
        { label: "A lowercase letter", regex: /[a-z]/ },
        { label: "A number", regex: /\d/ },
        { label: "A special character", regex: /[^A-Za-z0-9]/ }
    ], []);

    const score = useMemo(() => {
        if (!password) return 0;
        return criteria.reduce((acc, criterion) => acc + (criterion.regex.test(password) ? 1 : 0), 0);
    }, [password, criteria]);

    const barWidth = `${(score / criteria.length) * 100}%`;
    const barColor = useMemo(() => {
        if (score <= 2) return 'var(--warning-red, #DC3545)';
        if (score <= 4) return '#FFC107';
        return 'var(--success-green, #28A745)';
    }, [score]);

    return (
        <div style={{ marginTop: '10px' }}>
            <div style={{ height: '5px', backgroundColor: 'var(--light-grey, #E0E0E0)', borderRadius: '2px', overflow: 'hidden', marginBottom: '8px' }}>
                <div style={{ height: '100%', width: barWidth, backgroundColor: barColor, transition: 'width 0.3s ease-in-out, background-color 0.3s ease-in-out' }}></div>
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '12px', color: '#666' }}>
                {criteria.map((item, index) => (
                    <li key={index} style={{ marginBottom: '4px', opacity: item.regex.test(password) ? 1 : 0.6 }}>
                        {item.regex.test(password) ? '✓' : '✗'} {item.label}
                    </li>
                ))}
            </ul>
        </div>
    );
};

const EyeIcon = ({ visible }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {visible ? (<><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"></path><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"></path><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"></path><line x1="2" x2="22" y1="2" y2="22"></line></>) : (<><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"></path><circle cx="12" cy="12" r="3"></circle></>)}
    </svg>
);

const PasswordField = ({ name, value, onChange, placeholder, error, isVisible, onToggleVisibility, autoComplete, inputId }) => {
    const errorId = useId();
    return (
        <div style={{ position: 'relative', marginTop: '10px' }}>
            <VisuallyHiddenLabel htmlFor={inputId}>{placeholder}</VisuallyHiddenLabel>
            <input
                id={inputId}
                type={isVisible ? 'text' : 'password'}
                name={name}
                value={value}
                onChange={onChange}
                placeholder={placeholder}
                required
                minLength="8"
                autoComplete={autoComplete}
                aria-invalid={!!error}
                aria-describedby={error ? errorId : undefined}
                style={{ width: '100%', padding: '10px', boxSizing: 'border-box' }}
            />
            <button type="button" onClick={onToggleVisibility} style={{ position: 'absolute', right: '10px', top: '0', bottom: '0', margin: 'auto 0', height: '100%', cursor: 'pointer', color: '#555', background: 'none', border: 'none', display: 'flex', alignItems: 'center' }} aria-label={isVisible ? "Hide password" : "Show password"}>
                <EyeIcon visible={!isVisible} />
            </button>
            {error && <p id={errorId} style={{ color: 'var(--warning-red, #DC3545)', fontSize: '12px', margin: '5px 0 10px 0' }}>{error}</p>}
        </div>
    );
};

// --- Main Task Posting Form Component ---
function JobPostingForm() {
    const [currentStep, setCurrentStep] = useState(1);
    const [formData, setFormData] = useState(() => {
        try {
            const savedDraft = sessionStorage.getItem('taskio_job_draft');
            const parsed = savedDraft ? JSON.parse(savedDraft) : {};
            return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? {
                title: '', description: '', location: '', timeline: '', specificDate: '', budget: '',
                firstName: '', lastName: '', email: '', ...parsed, password: '', confirmPassword: ''
            } : {};
        } catch (error) {
            console.error("Failed to parse draft from sessionStorage", error);
            return {
                title: '', description: '', location: '', timeline: '', specificDate: '', budget: '',
                firstName: '', lastName: '', email: '', password: '', confirmPassword: ''
            };
        }
    });

    const navigate = useNavigate();
    const [user, setUser] = useState(auth.currentUser);
    const [formErrors, setFormErrors] = useState({});
    const [showPassword, setShowPassword] = useState({ main: false, confirm: false });
    const [isLoginMode, setIsLoginMode] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [liveRegionMessage, setLiveRegionMessage] = useState('');
    const [isCalendarOpen, setIsCalendarOpen] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isAiMenuOpen, setIsAiMenuOpen] = useState(false);
    const previousSearchTerm = useRef('');
    const justSelectedTitle = useRef(false);
    
    const totalSteps = user && !isLoginMode ? 4 : 5;

    // State for location search
    const [locationQuery, setLocationQuery] = useState(formData.location || '');
    const [locationSuggestions, setLocationSuggestions] = useState([]);
    const [isFetchingLocations, setIsFetchingLocations] = useState(false);
    const [highlightedLocationIndex, setHighlightedLocationIndex] = useState(-1);
    const debouncedLocationSearch = useDebounce(locationQuery, 750);

    // State for Title Suggestions
    const [titleSuggestions, setTitleSuggestions] = useState([]);
    const [isFetchingTitles, setIsFetchingTitles] = useState(false);
    const [highlightedTitleIndex, setHighlightedTitleIndex] = useState(-1);
    const debouncedTitleSearch = useDebounce(formData.title, 800);
    const [isTitleInputFocused, setIsTitleInputFocused] = useState(false);
    
    // Move all useId calls to the top level
    const titleId = useId(), descId = useId(), firstNameId = useId(), lastNameId = useId(), emailId = useId(), passwordId = useId(), confirmPasswordId = useId();
    const emailErrorId = useId();
    const locationHeadingId = useId();


    useEffect(() => {
        const unsubscribe = auth.onAuthStateChanged(newUser => {
            setUser(newUser);
            if (newUser && currentStep === 5) {
                setCurrentStep(4);
            }
        });
        return unsubscribe;
    }, [currentStep]);

    useEffect(() => {
        const draftData = { ...formData };
        delete draftData.password;
        delete draftData.confirmPassword;
        sessionStorage.setItem('taskio_job_draft', JSON.stringify(draftData));
    }, [formData]);

    // Effect for fetching location suggestions
    useEffect(() => {
        const searchTerm = debouncedLocationSearch.trim();
        const controller = new AbortController();

        if (searchTerm.length >= 3 && searchTerm !== previousSearchTerm.current) {
            previousSearchTerm.current = searchTerm;
            setIsFetchingLocations(true);
            setLiveRegionMessage('Searching for locations...');
            setLocationSuggestions([]);
            setHighlightedLocationIndex(-1);
            api.get(`/api/suburb-search?q=${searchTerm}`, { signal: controller.signal })
                .then(res => {
                    const filteredSuggestions = res.data.filter(s => s && s.name && s.state);
                    setLocationSuggestions(filteredSuggestions);
                })
                .catch(err => {
                    if (err.name !== 'CanceledError') {
                        setFormErrors(prev => ({...prev, location: "Could not fetch locations."}));
                    }
                })
                .finally(() => {
                    setIsFetchingLocations(false);
                    setLiveRegionMessage('');
                });
        } else if (searchTerm.length < 3) {
            setLocationSuggestions([]);
            previousSearchTerm.current = '';
        }

        return () => controller.abort();
    }, [debouncedLocationSearch]);

    // Effect for fetching title suggestions
    useEffect(() => {
        if (justSelectedTitle.current) {
            justSelectedTitle.current = false;
            return;
        }
        const searchTerm = debouncedTitleSearch.trim();
        if (searchTerm.length > 5 && isTitleInputFocused) { // Only fetch if input is focused
            setIsFetchingTitles(true);
            api.post('/api/title-suggestions', { title: searchTerm })
                .then(response => {
                    if (response.data && Array.isArray(response.data.suggestions)) {
                        setTitleSuggestions(response.data.suggestions);
                    }
                })
                .catch(error => console.error("Error fetching title suggestions:", error))
                .finally(() => setIsFetchingTitles(false));
        } else {
            setTitleSuggestions([]);
        }
    }, [debouncedTitleSearch, isTitleInputFocused]);

    const handleLocationSelect = useCallback((suburb) => {
        if (!suburb) return;
        const fullLocation = `${suburb.name}, ${suburb.state.abbreviation} ${suburb.postcode}`;
        setFormData(prev => ({ ...prev, location: fullLocation }));
        setLocationQuery(fullLocation);
        setLocationSuggestions([]);
        setHighlightedLocationIndex(-1);
        previousSearchTerm.current = '';
    }, []);

    // Handler for selecting a title suggestion
    const handleTitleSelect = useCallback((title) => {
        justSelectedTitle.current = true;
        setFormData(prev => ({ ...prev, title }));
        setTitleSuggestions([]); // Immediately clear suggestions
        setHighlightedTitleIndex(-1);
        setIsTitleInputFocused(false); // Mark as not focused to prevent re-fetching
    }, []);
    
    const validateField = useCallback((name, value) => {
        let error = '';
        if (name === 'email' && value && !/\S+@\S+\.\S+/.test(value)) {
            error = 'Please enter a valid email address.';
        }
        if (name === 'password' && value && value.length < 8) {
            error = 'Password must be at least 8 characters.';
        }
        if (name === 'confirmPassword') {
            error = value !== formData.password ? 'Passwords do not match.' : '';
        }
        setFormErrors(prev => ({...prev, [name]: error}));
    }, [formData.password]);

    const handleChange = useCallback((e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
        if (['email', 'password', 'confirmPassword'].includes(name)) {
            validateField(name, value);
        }
        if (formErrors.submit) {
            setFormErrors(prev => ({ ...prev, submit: '' }));
        }
    }, [validateField, formErrors.submit]);
    
    const handleBlur = useCallback((e) => {
        const { name, value } = e.target;
        const trimmedValue = value.trim();
        if (['firstName', 'lastName'].includes(name)) {
            setFormData(prev => ({...prev, [name]: trimmedValue.replace(/\s+/g, ' ')}));
        }
        if (name === 'email') {
            setFormData(prev => ({...prev, email: trimmedValue }));
        }
    }, []);

    const handleGenerateDescription = useCallback(async (mode, answers = {}) => {
        if (!formData.title.trim()) {
            setFormErrors(prev => ({ ...prev, description: 'Please enter a title first.' }));
            return;
        }
        setIsGenerating(true);
        setIsAiMenuOpen(false);
        setFormErrors(prev => ({ ...prev, description: '' }));

        try {
            const response = await api.post('/api/generate-description', {
                title: formData.title,
                description: formData.description,
                mode: mode,
                answers: answers
            });

            if (response.data && response.data.description) {
                setFormData(prev => ({ ...prev, description: response.data.description }));
            } else {
                throw new Error("Invalid response structure from server.");
            }
        } catch (error) {
            console.error("Error generating description:", error);
            setFormErrors(prev => ({ ...prev, description: 'Failed to generate description. Please try again.' }));
        } finally {
            setIsGenerating(false);
        }
    }, [formData.title, formData.description]);

    const handleDateSelect = useCallback((date) => {
        setFormData(prev => ({...prev, specificDate: date}));
        setIsCalendarOpen(false);
    }, []);

    const stepValid = useMemo(() => {
        switch (currentStep) {
            case 1: return formData.title.trim().length >= 5 && formData.description.trim().length >= 10;
            case 2: return formData.timeline === 'On a specific date' ? formData.specificDate.trim() !== '' : !!formData.timeline;
            case 3: return !!formData.budget;
            case 4: return formData.location.trim() !== '';
            case 5:
                const isEmailValid = /\S+@\S+\.\S+/.test(formData.email);
                const isPasswordValid = formData.password.length >= 8;
                if (isLoginMode) {
                    return isEmailValid && formData.password.trim() !== '';
                }
                return (formData.firstName.trim() !== '' && formData.lastName.trim() !== '' && isEmailValid && isPasswordValid && formData.password === formData.confirmPassword && !formErrors.email && !formErrors.password && !formErrors.confirmPassword);
            default: return false;
        }
    }, [currentStep, formData, isLoginMode, formErrors]);

    const nextStep = useCallback(() => setCurrentStep(prev => Math.min(prev + 1, totalSteps)), [totalSteps]);
    const prevStep = useCallback(() => setCurrentStep(prev => Math.max(1, prev - 1)), []);

    const handleFormKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.altKey && e.target.tagName !== 'TEXTAREA' && currentStep < totalSteps && stepValid) {
            if (!e.target.closest('#suburb-suggestions') && !e.target.closest('#title-suggestions')) {
                e.preventDefault();
                nextStep();
            }
        }
    };

    const handleLocationKeyDown = (e) => {
        if (locationSuggestions.length === 0) return;
        if (e.key === 'ArrowDown') { e.preventDefault(); setHighlightedLocationIndex(prev => (prev + 1) % locationSuggestions.length); } 
        else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlightedLocationIndex(prev => (prev - 1 + locationSuggestions.length) % locationSuggestions.length); } 
        else if (e.key === 'Enter') { e.preventDefault(); if (highlightedLocationIndex > -1) { handleLocationSelect(locationSuggestions[highlightedLocationIndex]); } } 
        else if (e.key === 'Escape') { e.preventDefault(); setLocationSuggestions([]); }
    };

    const handleTitleKeyDown = (e) => {
        if (titleSuggestions.length === 0) return;
        if (e.key === 'ArrowDown') { e.preventDefault(); setHighlightedTitleIndex(prev => (prev + 1) % titleSuggestions.length); } 
        else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlightedTitleIndex(prev => (prev - 1 + titleSuggestions.length) % titleSuggestions.length); } 
        else if (e.key === 'Enter') { e.preventDefault(); if (highlightedTitleIndex > -1) { handleTitleSelect(titleSuggestions[highlightedTitleIndex]); } } 
        else if (e.key === 'Escape') { e.preventDefault(); setTitleSuggestions([]); }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!stepValid) return;

        setIsSubmitting(true);
        setFormErrors({});
        setLiveRegionMessage('');
        
        const taskData = {
            title: formData.title.trim().replace(/\s+/g, ' '), 
            description: formData.description.trim().replace(/\s+/g, ' '), 
            location: formData.location.trim(),
            timeline: formData.timeline === 'On a specific date' ? formData.specificDate : formData.timeline,
            budget: formData.budget
        };

        try {
            let token;
            if (user) {
                try {
                    token = await user.getIdToken();
                } catch (tokenError) {
                    const errorMsg = "Your session has expired. Please log in again.";
                    setFormErrors({ submit: errorMsg });
                    setLiveRegionMessage(errorMsg);
                    setIsLoginMode(true);
                    await signOut(auth);
                    setCurrentStep(5);
                    throw tokenError;
                }
            } else {
                const email = formData.email.trim().toLowerCase();
                const password = formData.password;

                if (isLoginMode) {
                    const userCredential = await signInWithEmailAndPassword(auth, email, password);
                    token = await userCredential.user.getIdToken();
                } else {
                    await api.post(`/api/users/register`, {
                        email: email, password: password,
                        firstName: formData.firstName.trim().replace(/\s+/g, ' '), 
                        lastName: formData.lastName.trim().replace(/\s+/g, ' '),
                        role: 'homeowner'
                    });
                    const userCredential = await signInWithEmailAndPassword(auth, email, password);
                    token = await userCredential.user.getIdToken();
                }
            }
            
            const config = { headers: { Authorization: `Bearer ${token}` } };
            await api.post(`/api/jobs`, taskData, config);
            
            sessionStorage.removeItem('taskio_job_draft');
            navigate('/dashboard', { state: { successMessage: 'Task posted successfully!' } });

        } catch (err) {
            if (err.name !== 'CanceledError' && !formErrors.submit) {
                let errorMsg = err.response?.data?.message || "An error occurred. Please check your details and try again.";
                if (err.code === 'auth/email-already-in-use') {
                    errorMsg = "This email is already registered. Please log in to continue.";
                    setIsLoginMode(true);
                } else if (err.code === 'auth/invalid-credential') {
                     errorMsg = "Invalid email or password. Please try again.";
                }
                setFormErrors({ submit: errorMsg });
                setLiveRegionMessage(errorMsg);
            }
            console.error(err);
        } finally {
            setIsSubmitting(false);
        }
    };

    const renderStep = () => {
        switch (currentStep) {
            case 1: return (
                <div>
                    <h2>Step 1: What needs to be done?</h2>
                    <div style={{ position: 'relative', marginBottom: '15px' }}>
                        <VisuallyHiddenLabel htmlFor={titleId}>Task Title</VisuallyHiddenLabel>
                        <input id={titleId} type="text" name="title" value={formData.title} onChange={handleChange} onKeyDown={handleTitleKeyDown} onFocus={() => setIsTitleInputFocused(true)} onBlur={() => setTimeout(() => setIsTitleInputFocused(false), 200)} placeholder="e.g., Fix leaky kitchen tap" required minLength="5" style={{ width: '100%', padding: '10px', boxSizing: 'border-box' }} autoComplete="off" />
                        {(isFetchingTitles || titleSuggestions.length > 0) && (
                            <ul id="title-suggestions" role="listbox" style={{ listStyle: 'none', padding: '0', margin: '0', border: '1px solid #E0E0E0', borderRadius: '4px', position: 'absolute', width: '100%', backgroundColor: '#fff', zIndex: 20 }}>
                                {isFetchingTitles ? (
                                    <li style={{ padding: '10px', color: '#888' }}>Loading suggestions...</li>
                                ) : (
                                    titleSuggestions.map((suggestion, i) => (
                                        <li key={i} id={`title-option-${i}`} role="option" aria-selected={i === highlightedTitleIndex} onClick={() => handleTitleSelect(suggestion)} onMouseEnter={() => setHighlightedTitleIndex(i)} style={{ padding: '10px', cursor: 'pointer', borderBottom: '1px solid #E0E0E0', backgroundColor: i === highlightedTitleIndex ? '#F7F9FA' : 'transparent' }}>
                                            {suggestion}
                                        </li>
                                    ))
                                )}
                            </ul>
                        )}
                    </div>
                    
                    <div style={{ position: 'relative' }}>
                        <VisuallyHiddenLabel htmlFor={descId}>Task Description</VisuallyHiddenLabel>
                        <textarea id={descId} name="description" value={formData.description} onChange={handleChange} onBlur={handleBlur} placeholder="Describe the task in detail..." required minLength="10" rows="8" style={{ width: '100%', padding: '10px', boxSizing: 'border-box' }} />
                        <div style={{ position: 'absolute', bottom: '15px', right: '10px' }}>
                            <button 
                                type="button" 
                                onClick={() => setIsAiMenuOpen(prev => !prev)} 
                                disabled={isGenerating || !formData.title.trim()} 
                                style={{ 
                                    padding: '8px 14px', 
                                    cursor: 'pointer', 
                                    background: 'linear-gradient(45deg, #6a11cb 0%, #2575fc 100%)', 
                                    color: 'white', 
                                    border: 'none', 
                                    borderRadius: '6px', 
                                    opacity: isGenerating || !formData.title.trim() ? 0.6 : 1,
                                    display: 'flex',
                                    alignItems: 'center',
                                    fontSize: '14px',
                                    fontWeight: '500'
                                }}
                            >
                                <GeminiInspiredIcon />
                                {isGenerating ? 'Generating...' : 'AI Assist'}
                            </button>
                            {isAiMenuOpen && (
                                <div style={{ position: 'absolute', bottom: '100%', right: 0, backgroundColor: 'white', border: '1px solid #ccc', borderRadius: '6px', boxShadow: '0 4px 8px rgba(0,0,0,0.1)', zIndex: 30, marginBottom: '5px', width: '160px' }}>
                                    <ul style={{ listStyle: 'none', margin: 0, padding: '5px 0' }}>
                                        <li onClick={() => handleGenerateDescription('draft')} style={{ padding: '8px 12px', cursor: 'pointer' }}>Draft from title</li>
                                        <li onClick={() => handleGenerateDescription('clarify')} style={{ padding: '8px 12px', cursor: 'pointer' }}>Tighten & clarify</li>
                                    </ul>
                                </div>
                            )}
                        </div>
                    </div>
                    {formErrors.description && <p style={{ color: 'var(--warning-red, #DC3545)', fontSize: '12px', marginTop: '5px' }}>{formErrors.description}</p>}
                </div>
            );
            case 2: return (<fieldset><legend><h2>Step 2: When do you need this done?</h2></legend>{['Urgent (1-2 days)', 'Within 2 weeks', 'Flexible', 'On a specific date'].map(o => (<div key={o}><label style={{display: 'block', padding: '10px', border: '1px solid var(--light-grey, #ccc)', borderRadius: '4px', marginBottom: '10px', cursor: 'pointer', backgroundColor: formData.timeline === o ? 'var(--pale-cloud, #F7F9FA)' : 'transparent'}}><input type="radio" name="timeline" value={o} checked={formData.timeline === o} onChange={handleChange} style={{marginRight: '8px'}}/> {o}</label></div>))} {formData.timeline === 'On a specific date' && (<div style={{position: 'relative', marginTop: '10px'}}><button type="button" onClick={() => setIsCalendarOpen(prev => !prev)} style={{ width: '100%', padding: '10px', textAlign: 'left', backgroundColor: 'white', border: '1px solid #ccc', borderRadius: '4px', cursor: 'pointer' }}>{formData.specificDate || 'Select a date'}</button>{isCalendarOpen && <Calendar selectedDate={formData.specificDate} onDateSelect={handleDateSelect} onClose={() => setIsCalendarOpen(false)} />}</div>)}</fieldset>);
            case 3: return (<fieldset><legend><h2>Step 3: What is your estimated budget?</h2></legend>{['Under $500', '$500 - $1000', '$1000 - $2000', 'Over $2000', 'Not sure'].map(o => (<div key={o}><label style={{display: 'block', padding: '10px', border: '1px solid var(--light-grey, #ccc)', borderRadius: '4px', marginBottom: '10px', cursor: 'pointer', backgroundColor: formData.budget === o ? 'var(--pale-cloud, #F7F9FA)' : 'transparent'}}><input type="radio" name="budget" value={o} checked={formData.budget === o} onChange={handleChange} style={{marginRight: '8px'}}/> {o}</label></div>))}</fieldset>);
            case 4: return (<div style={{ position: 'relative' }}><h2 id={locationHeadingId}>Step 4: Where is the task located?</h2><input type="text" name="location" role="combobox" aria-haspopup="listbox" aria-autocomplete="list" aria-labelledby={locationHeadingId} aria-expanded={locationSuggestions.length > 0} aria-controls="suburb-suggestions" aria-activedescendant={highlightedLocationIndex > -1 ? `option-${highlightedLocationIndex}` : undefined} value={locationQuery} onChange={(e) => { setLocationQuery(e.target.value); handleChange(e); }} onKeyDown={handleLocationKeyDown} onBlur={() => setTimeout(() => setLocationSuggestions([]), 200)} placeholder="Enter suburb or postcode" required style={{ width: '100%', padding: '10px' }} autoComplete="off" />{formErrors.location && <p style={{ color: 'var(--warning-red, #DC3545)' }}>{formErrors.location}</p>}{locationSuggestions.length > 0 && (<ul id="suburb-suggestions" role="listbox" style={{ listStyle: 'none', padding: '0', margin: '0', border: '1px solid #E0E0E0', borderRadius: '4px', position: 'absolute', width: '100%', backgroundColor: '#fff', zIndex: 10 }}>{locationSuggestions.map((s, i) => (<li key={`${s.name}-${s.postcode}`} id={`option-${i}`} role="option" aria-selected={i === highlightedLocationIndex} onMouseEnter={() => setHighlightedLocationIndex(i)} onClick={() => handleLocationSelect(s)} style={{ padding: '10px', cursor: 'pointer', borderBottom: '1px solid #E0E0E0', backgroundColor: i === highlightedLocationIndex ? '#F7F9FA' : 'transparent' }}>{s.name}, {s.state.abbreviation} {s.postcode}</li>))}</ul>)}</div>);
            case 5: 
                const namesAreFilled = !isLoginMode && formData.firstName.trim() !== '' && formData.lastName.trim() !== '';
                return (
                    <div>
                        <h2>{isLoginMode ? 'Welcome back! Log in to post' : 'Step 5: Create your account to post'}</h2>
                        {isLoginMode ? (
                            <>
                                {formErrors.submit && <p style={{ color: 'var(--warning-red, #DC3545)' }}>{formErrors.submit}</p>}
                                <VisuallyHiddenLabel htmlFor={emailId}>Email Address</VisuallyHiddenLabel>
                                <input id={emailId} type="email" name="email" value={formData.email} onChange={handleChange} onBlur={handleBlur} placeholder="Email Address" required autoComplete="email" aria-invalid={!!formErrors.email} aria-describedby={formErrors.email ? emailErrorId : undefined} style={{ width: '100%', padding: '10px', marginBottom: '10px', boxSizing: 'border-box' }} />
                                {formErrors.email && <p id={emailErrorId} style={{ color: 'var(--warning-red, #DC3545)', fontSize: '12px', margin: '-5px 0 10px 0' }}>{formErrors.email}</p>}
                                <PasswordField inputId={passwordId} name="password" value={formData.password} onChange={handleChange} placeholder="Password" error={formErrors.password} isVisible={showPassword.main} onToggleVisibility={() => setShowPassword(p => ({...p, main: !p.main}))} autoComplete="current-password" />
                            </>
                        ) : (
                            <>
                                <p>This allows you to manage your task and receive quotes.</p>
                                <VisuallyHiddenLabel htmlFor={firstNameId}>First Name</VisuallyHiddenLabel>
                                <input id={firstNameId} type="text" name="firstName" value={formData.firstName} onChange={handleChange} onBlur={handleBlur} placeholder="First Name" required autoComplete="given-name" style={{ width: '100%', padding: '10px', marginBottom: '10px', boxSizing: 'border-box' }} />
                                <VisuallyHiddenLabel htmlFor={lastNameId}>Last Name</VisuallyHiddenLabel>
                                <input id={lastNameId} type="text" name="lastName" value={formData.lastName} onChange={handleChange} onBlur={handleBlur} placeholder="Last Name" required autoComplete="family-name" style={{ width: '100%', padding: '10px', marginBottom: '10px', boxSizing: 'border-box' }} />
                                
                                {namesAreFilled && (
                                    <div>
                                        <VisuallyHiddenLabel htmlFor={emailId}>Email Address</VisuallyHiddenLabel>
                                        <input id={emailId} type="email" name="email" value={formData.email} onChange={handleChange} onBlur={handleBlur} placeholder="Email Address" required autoComplete="email" aria-invalid={!!formErrors.email} aria-describedby={formErrors.email ? emailErrorId : undefined} style={{ width: '100%', padding: '10px', marginBottom: '10px', boxSizing: 'border-box' }} />
                                        {formErrors.email && <p id={emailErrorId} style={{ color: 'var(--warning-red, #DC3545)', fontSize: '12px', margin: '-5px 0 10px 0' }}>{formErrors.email}</p>}
                                        <PasswordField inputId={passwordId} name="password" value={formData.password} onChange={handleChange} placeholder="Password" error={formErrors.password} isVisible={showPassword.main} onToggleVisibility={() => setShowPassword(p => ({...p, main: !p.main}))} autoComplete="new-password" />
                                        <PasswordStrengthMeter password={formData.password} />
                                        <PasswordField inputId={confirmPasswordId} name="confirmPassword" value={formData.confirmPassword} onChange={handleChange} placeholder="Confirm Password" error={formErrors.confirmPassword} isVisible={showPassword.confirm} onToggleVisibility={() => setShowPassword(p => ({...p, confirm: !p.confirm}))} autoComplete="new-password" />
                                    </div>
                                )}
                            </>
                        )}
                        <p style={{fontSize: '12px', marginTop: '15px'}}>{isLoginMode ? "Don't have an account? " : "Already have an account? "}<span onClick={() => { setIsLoginMode(!isLoginMode); }} style={{color: 'var(--taskio-teal, #14C5C5)', cursor: 'pointer', textDecoration: 'underline'}}>{isLoginMode ? 'Sign Up' : 'Log In'}</span></p>
                    </div>
                );
            default: return null;
        }
    };

    return (
        <div style={{ display: 'flex', gap: '40px', padding: '40px', maxWidth: '1200px', margin: 'auto' }}>
            <div style={{ flex: 1 }}>
                <TaskSummary formData={formData} />
            </div>
            <div style={{ flex: 2 }}>
                <div role="status" aria-live="polite" aria-atomic="true" style={visuallyHiddenStyle}>
                    {liveRegionMessage}
                </div>
                <h1 style={{ fontFamily: 'Poppins, sans-serif' }}>Post a New Task</h1>
                <div style={{ marginBottom: '20px' }}>
                    <p>Step {currentStep} of {totalSteps}</p>
                    <div style={{ width: '100%', backgroundColor: 'var(--light-grey, #E0E0E0)', borderRadius: '4px' }}>
                        <div style={{ width: `${(currentStep / totalSteps) * 100}%`, backgroundColor: 'var(--taskio-teal, #14C5C5)', height: '10px', borderRadius: '4px', transition: 'width 0.3s ease-in-out' }}></div>
                    </div>
                </div>
                <form onSubmit={handleSubmit} onKeyDown={handleFormKeyDown}>
                    {renderStep()}
                    {formErrors.submit && !isLoginMode && <p style={{ color: 'var(--warning-red, #DC3545)', marginTop: '15px' }}>{formErrors.submit}</p>}
                    <div style={{ marginTop: '30px', display: 'flex', justifyContent: 'space-between' }}>
                        {currentStep > 1 && (<button type="button" onClick={prevStep} style={{ padding: '10px 20px' }}>Back</button>)}
                        {currentStep < totalSteps && (<button type="button" onClick={nextStep} disabled={!stepValid || isSubmitting || (currentStep === 4 && isFetchingLocations)} style={{ padding: '10px 20px', marginLeft: 'auto', backgroundColor: 'var(--taskio-orange, #FF9100)', color: 'white', border: 'none', borderRadius: '4px', cursor: !stepValid || isSubmitting ? 'not-allowed' : 'pointer', opacity: !stepValid || isSubmitting ? 0.6 : 1 }}>{isSubmitting ? 'Submitting...' : 'Next'}</button>)}
                        {currentStep === totalSteps && (<button type="submit" disabled={!stepValid || isSubmitting} style={{ padding: '10px 20px', marginLeft: 'auto', backgroundColor: 'var(--taskio-orange, #FF9100)', color: 'white', border: 'none', borderRadius: '4px', cursor: !stepValid || isSubmitting ? 'not-allowed' : 'pointer', opacity: !stepValid || isSubmitting ? 0.6 : 1 }}>{isSubmitting ? 'Submitting...' : (user ? 'Submit Task' : (isLoginMode ? 'Log In & Submit' : 'Sign Up & Submit'))}</button>)}
                    </div>
                </form>
            </div>
        </div>
    );
}

export default JobPostingForm;
