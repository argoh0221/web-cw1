import React from "react";
import { useNavigate,useLocation} from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import styles from "../components/Header.module.css"; //can make its own css later

export default function Navbar({ scrollToRef, sectionRefs }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, authenticating } = useAuth();

  const isAdmin = user?.isAdmin ?? false;  //check if admin user
  const isOrganiser = user?.isOrganiser ?? false;  //check if organiser

  const isHomePage = location.pathname === "/";  
  const isOrganiserHomePage = location.pathname === "/organiserhome";  
  const isLoginPage = location.pathname === "/login"; 
  const isSignUp = location.pathname === "/signup";  
  const isOrganiserSignUp = location.pathname === "/organiser/signup"; 
  const isEventsPage = location.pathname === "/events"; 
  const isOrganiserEventsPage = location.pathname === "/organiser/events"; 
  const is = location.pathname === "/events/:slug"; 
 

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <header className={styles.navbar}>
      
        <button
            type="button"
            className={styles.brand}
            aria-label="Go to home"
            onClick={() => navigate(isOrganiserHomePage || isOrganiserSignUp || isOrganiserEventsPage ? "/organiserhome" : "/")}
          >
            Event<span className={styles.brandAccent}>Sphere</span>
        </button>

        



      <nav className={styles.navLinks} aria-label="Main navigation">

        

        {isHomePage && (
          <>
            <button
          type="button"
          className={styles.navLink}
          onClick={() => navigate("/organiserhome")}
          style={{
      background: 'linear-gradient(135deg, #ec4b73, #6366f1)',
      borderRadius:'999px',
      padding:'10px 18px',
      
      color:'#f5f9ffff',
      
      
  }}
        >
          Organiser Page
        </button>
            
          </>
        )}

        {isOrganiserHomePage && (
          <>
            <button
          type="button"
          className={styles.navLink}
          onClick={() => navigate("/")}
          style={{
      background: 'linear-gradient(135deg, #ec4b73, #6366f1)',
      borderRadius:'999px',
      padding:'10px 18px',
      
      color:'#f5f9ffff',
      
      
  }}
        >
          Attendee Page
        </button>
            
          </>
        )}
        



        {isHomePage && (
          <>
            <button type="button" className={styles.navLink} onClick={() => navigate("/events")}
              style={{
      background: 'linear-gradient(135deg, #3a56dfff, #6366f1)',
      borderRadius:'999px',
      padding:'10px 18px',
      
      color:'#f5f9ffff',
      
      
  }}>
          Events
        </button>
        
            <button
              type="button"
              className={styles.navLink}
              onClick={() => scrollToRef(sectionRefs.featured)}
              style={{
      borderLeft: '3px solid rgba(111, 73, 186, 0.45)',
      padding:'10px',
      
      
  }}
            >
              Featured
            </button>
            <button
              type="button"
              className={styles.navLink}
              onClick={() => scrollToRef(sectionRefs.admin)}
            >
              Organisers
            </button>
          </>
        )}

        {isOrganiserHomePage && (//未完成
          <>
            
            
          </>
        )}
        
        
      </nav>

      <div className={styles.navActions}>
        {user ? (
          <>
            <span className={styles.navUser}>{user.email}</span>
            {isAdmin && (
              <button
                type="button"
                className={`${styles.navButton} ${styles.navGhost}`}
                onClick={() => navigate("/admin")}
              >
                Admin
              </button>
            )}
            
            {(isOrganiser ) && (
          <button
            type="button"
            className={`${styles.navButton} ${styles.navGhost}`}
            onClick={() => navigate("/organiser/events")}
          >
            My Events
          </button>
        )}
            <button
              type="button"
              className={`${styles.navButton} ${styles.navGhost}`}
              onClick={() => navigate("/my-tickets")}
            >
              My tickets
            </button>
            <button
              type="button"
              className={`${styles.navButton} ${styles.navPrimary}`}
              onClick={handleLogout}
              disabled={authenticating}
            >
              {authenticating ? "Signing out…" : "Log out"}
            </button>
          </>
        ) : (
          <>
            
            <button
              type="button"
              className={`${styles.navButton} ${styles.navGhost}`}
              onClick={() => navigate("/login")}
            >
              Sign In
            </button>
            
            <button
              type="button"
              className={`${styles.navButton} ${styles.navPrimary}`}
              onClick={() => navigate("/signup")}
            >
              Join as Attendee
            </button>
            <button
              type="button"
              className={`${styles.navButton} ${styles.navPrimary}`}
              onClick={() => navigate("/organiser/signup")}
            >
              Become an Organiser
            </button>
          </>
        )}
      </div>
    </header>
  );
}