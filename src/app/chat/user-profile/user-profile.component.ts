import { Component, OnInit, OnDestroy } from '@angular/core';
import { HttpClient, HttpClientModule, HttpHeaders } from '@angular/common/http';
import { Subject, takeUntil } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { NgIf, NgClass } from '@angular/common';
import { AvatarService } from '../../service/avatar.service';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { UserDTO } from '../../model/dto.model';

@Component({
  selector: 'user-infor',
  standalone: true,
  imports: [FormsModule, HttpClientModule, NgIf, NgClass],
  templateUrl: './user-profile.component.html',
  styleUrls: ['./user-profile.component.scss'],
  providers: [AvatarService], 
})
export class UserProfileComponent implements OnInit, OnDestroy {
  user: UserDTO = {};
  email: string | null = null;
  userId: string | null = null;
  isEditing = false;
  selectedAvatar: File | null = null;
  avatarUrl: SafeUrl | null = null;
  private readonly destroy$ = new Subject<void>(); // Thêm Subject để quản lý subscription

  constructor(private http: HttpClient,
     private avatarService: AvatarService,
      private sanitizer: DomSanitizer) { }

  async ngOnInit(): Promise<void> {
    await this.getUserMailFromToken();
    if (this.userId) {
      this.fetchUserDataAsync();
    } else {
      console.error('Không thể lấy userId, không gọi fetchUserDataAsync.');
      // Xử lý trường hợp không có userId
    }
  }

  getToken(): string | null {
    return localStorage.getItem('accessToken');
  }

  async getUserMailFromToken() {
    const token = this.getToken();
    if (token) {
      try {
        const payloadBase64 = token.split('.')[1];
        const payloadJson = atob(payloadBase64);
        const payload = JSON.parse(payloadJson);
        this.email = payload.sub;

        if (this.email) {
          this.userId = await this.getUserId(this.email);
          console.log('User ID:', this.userId); // Log userId to console
        } else {
          console.error('Email không được tìm thấy trong token.');
          return null;
        }
        return this.email; // Return email instead of payload.sub
      } catch (error) {
        console.error('Lỗi giải mã token:', error);
        return null;
      }
    }
    return null;
  }

  async getUserId(email: string) {
    const token = this.getToken();
    const headers = new HttpHeaders({
      Authorization: `Bearer ${token}`,
    });

    try {
      const response = await this.http
        .get<any>(`http://localhost:8989/api/v1/users/find-by-email/${email}`, {
          headers,
        })
        .toPromise();
      return response.data.id;
    } catch (error) {
      console.error('Lỗi khi lấy userId:', error);
      return null;
    }
  }

  async fetchUserDataAsync(): Promise<void> {
    const token = this.getToken();
    const headers = new HttpHeaders({
      Authorization: `Bearer ${token}`,
    });
    try {
      const response = await this.http.get<any>(`http://localhost:8989/api/v1/users/${this.userId}`, {
        headers,
      })
        .toPromise();
      console.log('Response:', response); // Log response to console
      if (response?.data) {
        this.user = { ...response.data };
        if (this.user?.avatar) {
          this.loadAvatarImage(this.user.avatar);
        }
      } else {
        console.error('Không tìm thấy thông tin người dùng hoặc dữ liệu trả về không hợp lệ.');
        // Xử lý trường hợp không có dữ liệu (ví dụ: hiển thị thông báo lỗi cho người dùng)
      }
    } catch (error) {
      console.error('Lỗi khi tải thông tin người dùng:', error);
    }
  }

  toggleEdit(): void {
    this.isEditing = !this.isEditing;
    if (!this.isEditing && this.hasChanges()) {
      this.saveChangesAsync(); // Tự động lưu khi click "Lưu" nếu có thay đổi
    } else if (!this.isEditing) {
      this.cancelEdit(); // Nếu không có thay đổi thì hủy (tránh call API không cần thiết)
    } else if (this.isEditing) {
      // Khi chuyển sang chế độ sửa, không cần làm gì thêm
    }
  }

  async saveChangesAsync(): Promise<void> {
    const token = this.getToken();
    const headers = new HttpHeaders({
      Authorization: `Bearer ${token}`,
    });
    try {
      const response = await this.http.put<any>(
        `http://localhost:8989/api/v1/users/update-users-infor/${this.userId}`,
        this.user, // Truyền this.user làm body của request
        { headers }  // Truyền headers trong object options
      )
        .toPromise();
      if (response?.data) {
        this.user = { ...response.data };
        // this.originalUser = { ...response.data };
        this.isEditing = false;
        console.log('Thông tin người dùng đã được cập nhật.');
      } else {
        console.error('Lỗi khi cập nhật thông tin người dùng.');
      }
    } catch (error) {
      console.error('Lỗi khi cập nhật thông tin người dùng:', error);
    }
  }

  cancelEdit(): void {
    this.isEditing = false;
    this.user = { ...this.user };
  }


  hasChanges(): boolean {
    return JSON.stringify(this.user) !== JSON.stringify(this.user);
  }

  onAvatarSelected(event: any): void {
    this.selectedAvatar = event.target.files[0];
  }

  clearAvatarSelection(): void {
    this.selectedAvatar = null;
  }

  // async uploadAvatar(): Promise<void> {
  //   if (this.selectedAvatar) {
  //     const formData = new FormData();
  //     formData.append('avatar', this.selectedAvatar);

  //     const token = this.getToken();
  //     const headers = new HttpHeaders({
  //       Authorization: `Bearer ${token}`,
  //     });

  //     try {
  //       const response = await this.http
  //         .post<any>(`http://localhost:8989/api/v1/users/avatar/upload-avatar`, formData, { headers })
  //         .toPromise();
  //       if (response?.url) {
  //         this.user = { ...this.user, avatar: response.avatar }; // Cập nhật avatar
  //         this.selectedAvatar = null; // Xóa ảnh đã chọn sau khi tải lên
  //         alert('Avatar uploaded successfully:');
  //         this.loadAvatarImage(response.url); // Tải lại ảnh mới sau khi upload
  //       } else {
  //         console.error('Failed to upload avatar.');
  //       }
  //     } catch (error) {
  //       console.error('Error uploading avatar:', error);
  //     }
  //   } else {
  //     console.warn('No avatar selected.');
  //   }
  // }

  async uploadAvatar(): Promise<void> {
    if (this.selectedAvatar) {
      const formData = new FormData();
      formData.append('avatar', this.selectedAvatar);

      const token = this.getToken();
      const headers = new HttpHeaders({
        Authorization: `Bearer ${token}`,
      });

      try {
        const response = await this.http
          .post<any>(`http://localhost:8989/api/v1/users/avatar/upload-avatar`, formData, { headers })
          .toPromise();
        if (response?.url) {
          this.user = { ...this.user, avatar: response.avatar }; // Cập nhật avatar
          this.selectedAvatar = null; // Xóa ảnh đã chọn sau khi tải lên
          alert('Avatar uploaded successfully:');
          this.loadAvatarImage(response.url); // Tải lại ảnh mới sau khi upload
        } else {
          console.error('Failed to upload avatar.');
        }
      } catch (error) {
        console.error('Error uploading avatar:', error);
      }
    } else {
      console.warn('No avatar selected.');
    }
  }

  getFilenameFromUrl(url: string): string | null {
    if (!url) {
      return null;
    }
    const parts = url.split('/');
    if (parts.length > 0) {
      return parts[parts.length - 1];
    }
    return 'Lỗi khi tải ảnh';
  }

  loadAvatarImage(filename: string): void {
    const imageUrl  = this.getFilenameFromUrl(filename)
    this.avatarService.getAvatarImage(imageUrl!)
      .pipe(takeUntil(this.destroy$))
      .subscribe(
        (blob) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            this.avatarUrl = this.sanitizer.bypassSecurityTrustUrl(reader.result as string);
          };
          reader.readAsDataURL(blob);
        },
        (error) => {
          console.error('Lỗi khi tải ảnh avatar:', error);
          // Có thể hiển thị ảnh placeholder nếu tải lỗi
        }
      );
  }


  ngOnDestroy(): void {
    this.destroy$.next(); // Phát tín hiệu để unsubscribe
    this.destroy$.complete(); // Hoàn thành Subject
  }
}