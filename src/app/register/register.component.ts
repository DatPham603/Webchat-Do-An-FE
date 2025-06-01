import { Component } from '@angular/core';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [
    FormsModule,
    HttpClientModule,
    CommonModule
  ],
  templateUrl: './register.component.html',
  styleUrl: './register.component.scss',
})
export class RegisterComponent {
  email = '';
  userName = '';
  passWord = '';
  phoneNumber = '';
  address = '';
  dateOfBirth = '';
  errorMessage = '';

  constructor(
    private http: HttpClient,
    private router: Router
  ) {}

  register() {
    this.errorMessage = '';

    const registerData = {
      email: this.email,
      userName: this.userName,
      passWord: this.passWord,
      phoneNumber: this.phoneNumber,
      address: this.address,
      dateOfBirth: this.dateOfBirth
    };

    this.http
      .post<any>('http://localhost:8989/api/v1/users/register', registerData)
      .subscribe(
        (response) => {
          if (response.success) {
            alert('Đăng ký thành công!');
            this.router.navigate(['/login']);
          } else {
            this.errorMessage = 'Đăng ký thất bại. Vui lòng kiểm tra lại thông tin.';
          }
        },
           (error) => {
          console.error('Lỗi đăng ký:', error);
          
          if (error.error && error.error.message) {
            this.errorMessage = error.error.message;
          } else if (error.status === 400 && error.error && typeof error.error === 'string' && error.error.includes('Email already exists')) {
            this.errorMessage = 'Email đã được sử dụng. Vui lòng chọn email khác.';
          } else if (error.status === 500 && error.error && typeof error.error === 'string' && error.error.includes('Email already exists')) {
            this.errorMessage = 'Email đã được sử dụng. Vui lòng chọn email khác.';
          } else {
            this.errorMessage = 'Lỗi kết nối. Vui lòng thử lại sau.';
          }
        }
      );
  }

  goToLogin() {
    this.router.navigate(['/login']);
  }
}